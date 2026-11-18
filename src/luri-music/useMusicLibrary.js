import { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY_LIBRARY = { playlists: [], history: [], settings: {}, updatedAt: null };
const MAX_HISTORY = 200;
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
  const [syncState, setSyncState] = useState('local');
  const namespaceRef = useRef(namespace); const dirtyRef = useRef(false); const serverUpdatedAtRef = useRef(null); const syncTimerRef = useRef(null);

  const saveLocal = useCallback((next) => {
    try { localStorage.setItem(storageKey(namespaceRef.current), JSON.stringify(storableLibrary(next))); } catch { /* Storage may be unavailable. */ }
  }, []);

  const updateLibrary = useCallback((updater) => {
    setLibrary((current) => {
      const updated = typeof updater === 'function' ? updater(current) : updater;
      const next = { ...updated, updatedAt: new Date().toISOString() };
      dirtyRef.current = true; saveLocal(next); return next;
    });
  }, [saveLocal]);

  const syncNow = useCallback(async (snapshot) => {
    if (!syncEnabled || !namespaceRef.current || !dirtyRef.current) return;
    setSyncState('syncing');
    try {
      const response = await fetch('/api/library', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ library: storableLibrary(snapshot), baseUpdatedAt: serverUpdatedAtRef.current }) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.library) {
        const merged = mergeLibraries(snapshot, data.library); serverUpdatedAtRef.current = data.updatedAt || data.library.updatedAt || null;
        dirtyRef.current = true; setLibrary(merged); saveLocal(merged); setSyncState('pending'); return;
      }
      if (!response.ok) throw new Error(data.error || '音乐库同步失败');
      serverUpdatedAtRef.current = data.updatedAt || null; dirtyRef.current = false; setSyncState('synced');
    } catch (error) { setSyncState('pending'); notify?.('同步稍后重试', error.message, 'warning'); }
  }, [notify, saveLocal, syncEnabled]);

  useEffect(() => {
    namespaceRef.current = namespace; dirtyRef.current = false; serverUpdatedAtRef.current = null;
    const local = readLibrary(namespace); setLibrary(local); setSyncState(syncEnabled ? 'syncing' : 'local');
    if (!syncEnabled || !namespace) return undefined;
    const controller = new AbortController();
    fetch('/api/library', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || '音乐库加载失败');
      if (controller.signal.aborted) return;
      serverUpdatedAtRef.current = data.updatedAt || data.library?.updatedAt || null;
      const merged = mergeLibraries(local, data.library || EMPTY_LIBRARY); const localHasChanges = newer(local.updatedAt, data.updatedAt) && Boolean(local.updatedAt);
      dirtyRef.current = localHasChanges; setLibrary(merged); saveLocal(merged); setSyncState(localHasChanges ? 'pending' : 'synced');
    }).catch((error) => { if (!controller.signal.aborted) { setSyncState('pending'); notify?.('音乐库暂时离线', error.message, 'warning'); } });
    return () => controller.abort();
  }, [namespace, notify, saveLocal, syncEnabled]);

  useEffect(() => {
    if (!syncEnabled || !dirtyRef.current) return undefined;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => { syncTimerRef.current = null; void syncNow(library); }, 1800);
    return () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); };
  }, [library, syncEnabled, syncNow]);

  useEffect(() => () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); }, []);
  return { library, updateLibrary, syncState };
}
