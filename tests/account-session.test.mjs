import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { handleLuriMusic } from '../functions/luri-music/index.js';
import { hash, passwordHash } from '../functions/luri-music/shared.js';

// Records every statement and answers the user lookups the handlers make.
const fakeDatabase = (rows = {}) => {
  const statements = [];
  const statement = (sql) => ({
    sql, values: [],
    bind(...values) { this.values = values; return this; },
    async first() { statements.push(this); return Object.entries(rows).find(([prefix]) => sql.startsWith(prefix))?.[1] ?? null; },
    async run() { statements.push(this); return { success: true }; },
  });
  return { statements, prepare: statement, async batch(list) { statements.push(...list); return list.map(() => ({ success: true })); } };
};
const request = (path, body, token = 'session-token') => new Request(`https://example.test/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `zy_music_session=${token}` }, body: JSON.stringify(body || {}) });

test('logging out deletes the session on the server, not only the cookie', async () => {
  const db = fakeDatabase();
  const response = await handleLuriMusic(request('auth/logout'), { LURI_MUSIC_DB: db });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /zy_music_session=; .*Max-Age=0/);
  const deleted = db.statements.find((item) => item.sql.startsWith('DELETE FROM luri_music_sessions'));
  assert.equal(deleted?.sql, 'DELETE FROM luri_music_sessions WHERE token_hash=?');
  assert.deepEqual(deleted.values, [await hash('session-token')]);
});

test('changing the password keeps this device signed in and signs out the others', async () => {
  const db = fakeDatabase({
    'SELECT u.id': { id: 'u1', email: 'a@example.test', display_name: 'A', session_expires_at: '2030-01-01T00:00:00.000Z' },
    'SELECT password_hash': { password_hash: await passwordHash('old-password', undefined, 1000) },
  });
  const response = await handleLuriMusic(request('auth/password', { currentPassword: 'old-password', password: 'new-password' }), { LURI_MUSIC_DB: db });
  assert.equal(response.status, 200);
  const deleted = db.statements.find((item) => item.sql.startsWith('DELETE FROM luri_music_sessions'));
  assert.equal(deleted?.sql, 'DELETE FROM luri_music_sessions WHERE user_id=? AND token_hash<>?');
  assert.deepEqual(deleted.values, ['u1', await hash('session-token')]);
  assert.ok(db.statements.some((item) => item.sql.startsWith('UPDATE luri_music_users SET password_hash')));
});

test('a wrong current password changes nothing', async () => {
  const db = fakeDatabase({
    'SELECT u.id': { id: 'u1', email: 'a@example.test', display_name: 'A', session_expires_at: '2030-01-01T00:00:00.000Z' },
    'SELECT password_hash': { password_hash: await passwordHash('old-password', undefined, 1000) },
  });
  const response = await handleLuriMusic(request('auth/password', { currentPassword: 'wrong-password', password: 'new-password' }), { LURI_MUSIC_DB: db });
  assert.equal(response.status, 400);
  assert.ok(!db.statements.some((item) => /^(?:UPDATE|DELETE)/.test(item.sql)));
});

test('settings group account, playback and about rows and hide sign-in-only rows from guests', () => {
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  const settings = music.slice(music.indexOf("{listView === 'settings' &&"), music.indexOf("{!['playlists', 'settings', 'random'].includes(listView)"));
  assert.match(settings, /\{user && <div className="music-app-settings__rows">[\s\S]*?修改密码[\s\S]*?退出登录/, 'Account actions live in the account card and only when signed in');
  assert.match(settings, /\{user && <section aria-labelledby="music-playback-title">[\s\S]*?QUALITY_META\[playbackQuality\]\?\.label[\s\S]*?activeProvider\?\.displayName \|\| '未启用'/, 'Playback rows show readable values and are hidden from guests');
  assert.doesNotMatch(settings, /activeProvider\?\.name\b/, 'Providers expose displayName');
  assert.doesNotMatch(settings, /登录后设置|登录后配置|请先登录/);
});
