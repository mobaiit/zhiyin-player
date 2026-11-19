import { json, now, loginRequired } from './shared.js';
import { songIdFor } from '../../shared/song-identity.js';
import { parseUserData, serializeUserData } from './user-data.js';

const MAX_PLAYLISTS = 30;
const MAX_TRACKS_PER_PLAYLIST = 200;
const MAX_HISTORY = 200;
const MAX_SNAPSHOT_BYTES = 768 * 1024;
const text = (value, limit) => String(value || '').trim().slice(0, limit);

const sanitizeBinding = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !text(value.source, 100) || !text(value.sourceId, 500) || !value.meta || typeof value.meta !== 'object' || Array.isArray(value.meta)) return null;
  return { source: text(value.source, 100), sourceId: text(value.sourceId, 500), meta: value.meta, art: text(value.art, 2000), ...(text(value.resolver, 100) ? { resolver: text(value.resolver, 100) } : {}) };
};

const RANDOM_ERAS = new Set(['new', 'any', 'classic']);
const RANDOM_LANGUAGES = new Set(['zh', 'en', 'jk', 'yue', 'instrumental']);
// Random play hints for the Provider; anything unknown is dropped rather than stored.
export const sanitizeRandomPreferences = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !RANDOM_ERAS.has(value.era)) return null;
  const languages = Array.isArray(value.languages) ? [...new Set(value.languages.filter((language) => RANDOM_LANGUAGES.has(language)))] : [];
  return { era: value.era, languages };
};

const sanitizeTrack = (item) => {
  const title = text(item?.title, 300); const artist = text(item?.artist, 300); const sourceBinding = sanitizeBinding(item?.binding);
  if (!title || !artist || !sourceBinding || item?.sourceType === 'local') return null;
  return { songId: songIdFor(title, artist), title, artist, album: text(item?.album, 300), art: text(item?.art, 2000), binding: sourceBinding };
};

const sanitizeTracks = (items, limit) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).slice(0, limit).flatMap((item) => {
    const track = sanitizeTrack(item); if (!track || seen.has(track.songId)) return [];
    seen.add(track.songId); return [track];
  });
};

export const sanitizeLibrary = (value, timestamp = null) => {
  const ids = new Set();
  const playlists = (Array.isArray(value?.playlists) ? value.playlists : []).slice(0, MAX_PLAYLISTS).flatMap((item, index) => {
    const name = text(item?.name, 80); let id = text(item?.id, 80) || `playlist-${index + 1}`;
    if (!name) return [];
    while (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    return [{ id, name, description: text(item?.description, 300), tracks: sanitizeTracks(item?.tracks, MAX_TRACKS_PER_PLAYLIST), createdAt: text(item?.createdAt, 40) || timestamp, updatedAt: text(item?.updatedAt, 40) || timestamp }];
  });
  const history = sanitizeTracks(value?.history, MAX_HISTORY).map((track) => {
    const source = (Array.isArray(value?.history) ? value.history : []).find((item) => songIdFor(item?.title, item?.artist) === track.songId);
    return { ...track, playedAt: text(source?.playedAt, 40) || timestamp, playCount: Math.min(100000, Math.max(1, Number(source?.playCount) || 1)) };
  });
  const settings = value?.settings && typeof value.settings === 'object' && !Array.isArray(value.settings) ? {
    compactMode: Boolean(value.settings.compactMode),
    reduceTransparency: Boolean(value.settings.reduceTransparency),
    ...(sanitizeRandomPreferences(value.settings.randomPreferences) ? { randomPreferences: sanitizeRandomPreferences(value.settings.randomPreferences) } : {}),
  } : {};
  return { playlists, history, settings, updatedAt: timestamp || text(value?.updatedAt, 40) || null };
};

export async function handleLibraryRequest(request, env, user) {
  if (!user) return loginRequired();
  const row = await env.LURI_MUSIC_DB.prepare('SELECT favorites_json FROM luri_music_users WHERE id=?').bind(user.id).first();
  const stored = parseUserData(row?.favorites_json);
  if (request.method === 'GET') return json({ library: sanitizeLibrary(stored.library), updatedAt: stored.library.updatedAt || null }, 200, { 'cache-control': 'no-store' });
  if (request.method === 'PUT') {
    const data = await request.json().catch(() => ({}));
    if (data.baseUpdatedAt && stored.library.updatedAt && Date.parse(data.baseUpdatedAt) < Date.parse(stored.library.updatedAt)) {
      return json({ error: '其他设备已更新音乐库', code: 'library_conflict', library: sanitizeLibrary(stored.library), updatedAt: stored.library.updatedAt }, 409);
    }
    const timestamp = now(); const library = sanitizeLibrary(data.library, timestamp); const snapshot = serializeUserData(stored.favorites, library);
    if (new TextEncoder().encode(snapshot).byteLength > MAX_SNAPSHOT_BYTES) return json({ error: '音乐库数据过大' }, 413);
    await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_users SET favorites_json=?,updated_at=? WHERE id=?').bind(snapshot, timestamp, user.id).run();
    return json({ ok: true, library, updatedAt: timestamp }, 200, { 'cache-control': 'no-store' });
  }
  return json({ error: 'Method not allowed' }, 405);
}
