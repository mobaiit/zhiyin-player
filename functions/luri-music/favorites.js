import { json, now } from './shared.js';
import { songIdFor } from '../../shared/song-identity.js';
import { parseUserData, serializeUserData } from './user-data.js';

const MAX_FAVORITES = 1000;
const MAX_SNAPSHOT_BYTES = 128 * 1024;
const text = (value, limit) => String(value || '').slice(0, limit);

const binding = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.source !== 'string' || !value.source || typeof value.sourceId !== 'string' || !value.sourceId || !value.meta || typeof value.meta !== 'object' || Array.isArray(value.meta) || typeof value.art !== 'string') return null;
  return {
    source: text(value.source, 100),
    sourceId: text(value.sourceId, 500),
    meta: value.meta,
    art: text(value.art, 2000)
  };
};

// Artwork is a display cache: only http(s) URLs are kept, and they are the first
// thing dropped when a large collection would exceed the snapshot limit.
const artUrl = (value) => /^https?:\/\//i.test(String(value || '')) ? text(value, 2000) : '';
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export const sanitizeFavorites = (items) => {
  const seen = new Set();
  const favorites = (Array.isArray(items) ? items : []).slice(0, MAX_FAVORITES).flatMap((item) => {
    const title = String(item?.title || ''); const artist = String(item?.artist || ''); const songId = title && artist ? songIdFor(title, artist) : ''; const sourceBinding = binding(item?.binding);
    if (!songId || !sourceBinding || seen.has(songId)) return [];
    seen.add(songId);
    return [{ songId, title, artist, album: String(item?.album || ''), art: artUrl(item?.art), binding: sourceBinding }];
  });
  return byteLength(favorites) > MAX_SNAPSHOT_BYTES ? favorites.map(({ art: _art, ...favorite }) => ({ ...favorite, art: '' })) : favorites;
};

export async function handleFavoriteRequest(request, env, user) {
  if (!user) return json({ error: '请先登录' }, 401);
  if (request.method === 'GET') {
    const row = await env.LURI_MUSIC_DB.prepare('SELECT favorites_json,favorites_updated_at FROM luri_music_users WHERE id=?').bind(user.id).first();
    const items = sanitizeFavorites(parseUserData(row?.favorites_json).favorites);
    return json({ items, updatedAt: row?.favorites_updated_at || null }, 200, { 'cache-control': 'no-store' });
  }
  if (request.method === 'PUT') {
    const data = await request.json().catch(() => ({})); const items = sanitizeFavorites(data.items);
    const row = await env.LURI_MUSIC_DB.prepare('SELECT favorites_json FROM luri_music_users WHERE id=?').bind(user.id).first();
    const stored = parseUserData(row?.favorites_json); const snapshot = serializeUserData(items, stored.library);
    if (byteLength(items) > MAX_SNAPSHOT_BYTES) return json({ error: '收藏数据过大' }, 413);
    const timestamp = now();
    await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_users SET favorites_json=?,favorites_updated_at=?,updated_at=? WHERE id=?').bind(snapshot, timestamp, timestamp, user.id).run();
    return json({ ok: true, items, updatedAt: timestamp, count: items.length }, 200, { 'cache-control': 'no-store' });
  }
  return json({ error: 'Method not allowed' }, 405);
}
