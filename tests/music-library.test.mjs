import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUserData, serializeUserData } from '../functions/luri-music/user-data.js';
import { sanitizeLibrary } from '../functions/luri-music/library.js';
import { sanitizeFavorites } from '../functions/luri-music/favorites.js';

const providerTrack = (title = 'Song', artist = 'Artist') => ({
  title,
  artist,
  album: 'Album',
  binding: { source: 'test', sourceId: `${title}:${artist}`, meta: {}, art: '' },
});

test('legacy favorites arrays remain readable after the music-library upgrade', () => {
  const legacy = [providerTrack()];
  const parsed = parseUserData(JSON.stringify(legacy));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.favorites, legacy);
  assert.deepEqual(parsed.library.playlists, []);
});

test('compound user data keeps favorites and library in one compatible snapshot', () => {
  const serialized = serializeUserData([providerTrack()], { playlists: [{ id: 'p1', name: 'My list', tracks: [providerTrack()] }], history: [], settings: {}, updatedAt: '2026-11-17T00:00:00.000Z' });
  const parsed = parseUserData(serialized);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.favorites.length, 1);
  assert.equal(parsed.library.playlists[0].name, 'My list');
});

test('library sanitization removes local tracks and enforces playlist/history limits', () => {
  const localTrack = { ...providerTrack('Local'), sourceType: 'local' };
  const playlists = Array.from({ length: 35 }, (_, index) => ({ id: `p${index}`, name: `List ${index}`, tracks: [providerTrack(`Song ${index}`), localTrack] }));
  const history = Array.from({ length: 220 }, (_, index) => ({ ...providerTrack(`History ${index}`), playedAt: '2026-11-17T00:00:00.000Z', playCount: index + 1 }));
  const sanitized = sanitizeLibrary({ playlists, history }, '2026-11-17T01:00:00.000Z');
  assert.equal(sanitized.playlists.length, 30);
  assert.equal(sanitized.playlists[0].tracks.length, 1);
  assert.equal(sanitized.history.length, 200);
  assert.ok(sanitized.history.every((track) => track.sourceType !== 'local'));
});

test('synced favourites keep Provider artwork URLs and drop them before exceeding the size limit', () => {
  const [kept] = sanitizeFavorites([{ ...providerTrack(), art: 'https://img.example/cover.jpg' }]);
  assert.equal(kept.art, 'https://img.example/cover.jpg');
  for (const art of ['data:image/png;base64,AAAA', 'blob:https://zhiyin.us.ci/1', 'javascript:alert(1)', 42]) {
    assert.equal(sanitizeFavorites([{ ...providerTrack(), art }])[0].art, '', String(art));
  }
  const many = Array.from({ length: 1000 }, (_, index) => ({ ...providerTrack(`Song ${index}`), art: `https://img.example/${'x'.repeat(200)}/${index}.jpg` }));
  const trimmed = sanitizeFavorites(many);
  assert.equal(trimmed.length, 1000, 'Songs are never dropped to make room for artwork');
  assert.ok(trimmed.every((favorite) => favorite.art === ''));
});

test('unknown client routes are normalized to the music app root', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(source, /replaceState\(null, '', '\/'\)/);
  assert.match(source, /pathname !== '\/admin'.*pathname !== '\/docs'/s);
});
