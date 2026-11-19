import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionExpired } from './session';

const EMPTY_LIBRARY = { playlists: [], history: [], settings: {}, updatedAt: null };
const MAX_HISTORY = 200;
// Playlist edits sync almost at once; play history and artwork write-backs wait and share one request.
const EDIT_SYNC_DELAY_MS = 1800;
const DEFERRED_SYNC_DELAY_MS = 30 * 1000;
// Browsers reject keepalive bodies over 64 KB.
const KEEPALIVE_LIMIT = 60 * 1024;
const storageKey = (namespace) => `luri.music.library.v1.${namespace || 'guest'}`;

const readLibrary = (namespace) => {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(namespace)) || 'null');
    if (!value || typeof value !== 'object') return { ...EMPTY_LIBRARY };
    return { playlists: Array.isArray(value.playlists) ? value.playlists : [], history: Array.isArray(value.history) ? value.history : [], settings: value.settings && typeof value.settings === 'object' ? value.settings : {}, updatedAt: value.updatedAt || null };
  } catch { return { ...EMPTY_LIBRARY }; }
};

const storableLibrary = (library) => ({
  ...library,
  playlists: library.playlists.map((playlist) => ({ ...playlist, tracks: playlist.tracks.filter((track) => track.sourceType !== 'local').map(({ url: _url, localUrl: _localUrl, ...track }) => track) })),
  history: library.history.filter((track) => track.sourceType !== 'local').map(({ url: _url, localUrl: _localUrl, ...track }) => track),
});

const newer = (left, right) => (Date.parse(left || '') || 0) >= (Date.parse(right || '') || 0);
const mergeLibraries = (local, remote) => {
  const playlists = new Map();
  for (const playlist of [...(remote.playlists || []), ...(local.playlists || [])]) {
    const current = playlists.get(playlist.id);
    if (!current || newer(playlist.updatedAt, current.updatedAt)) playlists.set(playlist.id, playlist);
  }
  const history = new Map();
  for (const track of [...(remote.history || []), ...(local.history || [])]) {
    const current = history.get(track.songId);
    if (!current || newer(track.playedAt, current.playedAt)) history.set(track.songId, track);
  }
  const localNewer = newer(local.updatedAt, remote.updatedAt);
  return {
    playlists: [...playlists.values()],
    history: [...history.values()].sort((a, b) => (Date.parse(b.playedAt || '') || 0) - (Date.parse(a.playedAt || '') || 0)).slice(0, MAX_HISTORY),
    settings: localNewer ? { ...(remote.settings || {}), ...(local.settings || {}) } : { ...(local.settings || {}), ...(remote.settings || {}) },
    updatedAt: localNewer ? local.updatedAt : remote.updatedAt,
  };
};

export default function useMusicLibrary(namespace, syncEnabled, notify) {
  const [library, setLibrary] = useState(() => readLibrary(namespace));
  const [syncState, setSyncState] = useState('local'); const [syncRetry, setSyncRetry] = useState(0);
  const namespaceRef = useRef(namespace); const dirtyRef = useRef(false); const serverUpdatedAtRef = useRef(null); const syncTimerRef = useRef(null);
  const urgentRef = useRef(false); const versionRef = useRef(0); const libraryRef = useRef(library); const syncingRef = useRef(false);

  const saveLocal = useCallback((next) => {
    try { localStorage.setItem(storageKey(namespaceRef.current), JSON.stringify(storableLibrary(next))); } catch { /* Storage may be unavailable. */ }
  }, []);

  const updateLibrary = useCallback((updater, { deferSync = false } = {}) => {
    setLibrary((current) => {
      const updated = typeof updater === 'function' ? updater(current) : updater;
      const next = { ...updated, updatedAt: new Date().toISOString() };
      dirtyRef.current = true; versionRef.current += 1; if (!deferSync) urgentRef.current = true; saveLocal(next); return next;
    });
  }, [saveLocal]);

  const syncNow = useCallback(async (snapshot, { leaving = false } = {}) => {
    if (!syncEnabled || !namespaceRef.current || !dirtyRef.current || syncingRef.current) return;
    const version = versionRef.current; const body = JSON.stringify({ library: storableLibrary(snapshot), baseUpdatedAt: serverUpdatedAtRef.current });
    syncingRef.current = true; setSyncState('syncing');
    try {
      const response = await fetch('/api/library', { method: 'PUT', credentials: 'same-origin', keepalive: leaving && body.length < KEEPALIVE_LIMIT, headers: { 'content-type': 'application/json' }, body });
      // Changes stay in local storage and sync after signing in again.
      if (await sessionExpired(response)) { setSyncState('pending'); return; }
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.library) {
        const merged = mergeLibraries(snapshot, data.library); serverUpdatedAtRef.current = data.updatedAt || data.library.updatedAt || null;
        dirtyRef.current = true; setLibrary(merged); saveLocal(merged); setSyncState('pending'); return;
      }
      if (!response.ok) throw new Error(data.error || '音乐库同步失败');
      serverUpdatedAtRef.current = data.updatedAt || null;
      // A change made while the request was in flight still needs its own sync.
      if (version === versionRef.current) { dirtyRef.current = false; urgentRef.current = false; setSyncState('synced'); } else { setSyncState('pending'); setSyncRetry((value) => value + 1); }
    } catch (error) { setSyncState('pending'); if (!leaving) notify?.('同步稍后重试', error.message, 'warning'); }
    finally { syncingRef.current = false; }
  }, [notify, saveLocal, syncEnabled]);

  useEffect(() => {
    namespaceRef.current = namespace; dirtyRef.current = false; urgentRef.current = false; serverUpdatedAtRef.current = null;
    const local = readLibrary(namespace); setLibrary(local); setSyncState(syncEnabled ? 'syncing' : 'local');
    if (!syncEnabled || !namespace) return undefined;
    const controller = new AbortController();
    fetch('/api/library', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (await sessionExpired(response)) { setSyncState('pending'); return; }
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || '音乐库加载失败');
      if (controller.signal.aborted) return;
      serverUpdatedAtRef.current = data.updatedAt || data.library?.updatedAt || null;
      const merged = mergeLibraries(local, data.library || EMPTY_LIBRARY); const localHasChanges = newer(local.updatedAt, data.updatedAt) && Boolean(local.updatedAt);
      dirtyRef.current = localHasChanges; setLibrary(merged); saveLocal(merged); setSyncState(localHasChanges ? 'pending' : 'synced');
    }).catch((error) => { if (!controller.signal.aborted) { setSyncState('pending'); notify?.('音乐库暂时离线', error.message, 'warning'); } });
    return () => controller.abort();
  }, [namespace, notify, saveLocal, syncEnabled]);

  useEffect(() => {
    libraryRef.current = library;
    if (!syncEnabled || !dirtyRef.current) return undefined;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => { syncTimerRef.current = null; void syncNow(libraryRef.current); }, urgentRef.current ? EDIT_SYNC_DELAY_MS : DEFERRED_SYNC_DELAY_MS);
    return () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); };
  }, [library, syncEnabled, syncNow, syncRetry]);

  // Deferred changes must not wait for a timer that never fires once the tab is hidden or closed.
  useEffect(() => {
    if (!syncEnabled) return undefined;
    const flush = (event) => {
      if (event.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
      if (!dirtyRef.current) return;
      if (syncTimerRef.current) { window.clearTimeout(syncTimerRef.current); syncTimerRef.current = null; }
      void syncNow(libraryRef.current, { leaving: true });
    };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [syncEnabled, syncNow]);

  useEffect(() => () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); }, []);
  return { library, updateLibrary, syncState };
}
