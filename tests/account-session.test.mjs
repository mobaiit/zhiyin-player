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

test('changing the user name saves a trimmed name of at most 40 characters', async () => {
  const user = { 'SELECT u.id': { id: 'u1', email: 'a@example.test', display_name: 'A', session_expires_at: '2030-01-01T00:00:00.000Z' } };
  const db = fakeDatabase(user);
  const response = await handleLuriMusic(request('auth/profile', { name: `  ${'名'.repeat(45)}  ` }), { LURI_MUSIC_DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { name: '名'.repeat(40) });
  const updated = db.statements.find((item) => item.sql.startsWith('UPDATE luri_music_users SET display_name'));
  assert.equal(updated.values[0], '名'.repeat(40));
  assert.equal(updated.values[2], 'u1');
  const empty = fakeDatabase(user);
  assert.equal((await handleLuriMusic(request('auth/profile', { name: '   ' }), { LURI_MUSIC_DB: empty })).status, 400);
  assert.ok(!empty.statements.some((item) => item.sql.startsWith('UPDATE')), 'An empty name changes nothing');
});

test('the sidebar account shows the avatar and name, with a reminder only near the service end', () => {
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  const source = music.slice(music.indexOf('const SERVICE_LONG_TERM_DAYS = '), music.indexOf('const serviceEndDate = '));
  const serviceStatus = new Function(`${source}; return serviceStatus;`)();
  const now = Date.parse('2026-01-01T00:00:00.000Z'); const day = 864e5; const at = (days) => new Date(now + days * day).toISOString();
  assert.deepEqual(serviceStatus(at(0.2), now), { text: '剩余 1 天', tone: 'expiring' });
  assert.deepEqual(serviceStatus(at(29), now), { text: '剩余 29 天', tone: 'expiring' });
  assert.deepEqual(serviceStatus(at(30), now), { text: '剩余 1 个月', tone: 'normal' });
  assert.deepEqual(serviceStatus(at(364), now), { text: '剩余 12 个月', tone: 'normal' });
  assert.deepEqual(serviceStatus(at(365), now), { text: '剩余 1 年', tone: 'normal' });
  assert.deepEqual(serviceStatus(at(3649), now), { text: '剩余 9 年', tone: 'normal' });
  assert.deepEqual(serviceStatus(at(3650), now), { text: '长期有效', tone: 'normal', longTerm: true });
  assert.deepEqual(serviceStatus(at(-1), now), { text: '已过期', tone: 'expired' });
  assert.equal(serviceStatus(null, now), null);
  assert.match(music, /const serviceReminder = service && service\.tone !== 'normal' \? service : null;/, 'Only an expiring or ended service is mentioned in the sidebar');
  assert.match(music, /<span className="music-app-account__avatar" aria-hidden="true">\{avatarInitial\}<\/span><span className="music-app-account__copy"><b>\{user\?\.name \|\| '访客模式'\}<\/b>\{serviceReminder && <small className=\{`is-\$\{serviceReminder\.tone\}`\}>/);
  assert.match(music, /className=\{`music-app-account\$\{listView === 'settings' \? ' active' : ''\}`\}[^>]*onClick=\{\(\) => navigate\('\/settings'\)\}/, 'The account opens settings and shows when they are open');
  assert.doesNotMatch(music, /\['\/settings', '设置', 'settings'\],\n/, 'The sidebar has no separate settings row');
  assert.match(music, /<b>服务有效期<\/b><span className=\{`is-\$\{service\?\.tone \|\| 'normal'\}`\}>\{!service \? 'Provider 未提供' : service\.longTerm \? '长期有效' : <>\{service\.text\} · <time dateTime=\{activeProvider\.expiresAt\}>\{serviceEndDate\(activeProvider\.expiresAt\)\}<\/time>/, 'Settings show when the service ends');
  assert.match(music, /onClick=\{\(\) => onOpenSettings\?\.\('name'\)\}><b>修改用户名<\/b>/);
  const shell = readFileSync(new URL('../src/luri-music/LuriMusic.jsx', import.meta.url), 'utf8');
  assert.match(shell, /\{dialog === 'name' && <NameDialog /);
  assert.match(shell, /api\('auth\/profile', \{ method: 'POST'/);
  assert.match(shell, /onLogout=\{\(\) => openAccountDialog\('logout'\)\}/, 'Logging out asks first');
  assert.match(shell, /<ConfirmDialog open=\{dialog === 'logout'\} title="退出登录？"[^\n]*?onConfirm=\{logout\} \/>/);
  const providers = readFileSync(new URL('../functions/luri-music/providers.js', import.meta.url), 'utf8');
  assert.match(providers, /const publicConfig = \(row, activeId, presentation = null\) => \(\{ expiresAt: serviceExpiresAt\(row, presentation\),/, 'Providers report when the service ends');
  const widget = readFileSync(new URL('../src/luri-music/Turnstile.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(widget, /正在加载人机验证/, 'The human check loads without a text notice');
});

test('settings group account, service, playback and about rows and hide sign-in-only rows from guests', () => {
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  const settings = music.slice(music.indexOf("{listView === 'settings' &&"), music.indexOf("{!['playlists', 'settings', 'random'].includes(listView)"));
  assert.match(settings, /\{user && <div className="music-app-settings__rows">[\s\S]*?修改用户名[\s\S]*?修改密码[\s\S]*?退出登录/, 'Account actions live in the account card and only when signed in');
  assert.match(settings, /\{user && <section className="music-app-settings__service" aria-labelledby="music-service-title">[\s\S]*?Provider 配置<\/b><span>\{activeProvider\?\.displayName \|\| '未启用'\}/, 'The Provider sits with the service, away from playback');
  assert.match(settings, /<section className="music-app-settings__playback" aria-labelledby="music-playback-title">[\s\S]*?\{user && <div className="music-app-settings__rows">[\s\S]*?QUALITY_META\[playbackQuality\]\?\.label/, 'The quality row shows a readable value and is hidden from guests');
  assert.doesNotMatch(settings, /activeProvider\?\.name\b/, 'Providers expose displayName');
  assert.doesNotMatch(settings, /登录后设置|登录后配置|请先登录/);
});

test('every signed-in endpoint answers an ended session with code login_required', async () => {
  // A cookie whose session is gone: the user lookup finds nothing.
  for (const [method, path] of [['GET', 'library'], ['PUT', 'library'], ['GET', 'favorites'], ['PUT', 'favorites'], ['GET', 'providers'], ['POST', 'providers/p1/proxy'], ['PATCH', 'preferences'], ['POST', 'auth/password'], ['POST', 'auth/profile']]) {
    const response = await handleLuriMusic(new Request(`https://example.test/api/${path}`, { method, headers: { 'content-type': 'application/json', cookie: 'zy_music_session=ended' }, ...(method === 'GET' ? {} : { body: '{}' }) }), { LURI_MUSIC_DB: fakeDatabase() });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: '请先登录', code: 'login_required' }, `${method} ${path}`);
  }
});

test('an ended session is reported once to the account shell, never as a Provider rejection', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch; const originalWindow = globalThis.window;
  try {
    globalThis.window = new EventTarget(); let reported = 0;
    window.addEventListener('zhiyin:session-expired', () => { reported += 1; });
    const { default: ProviderClient } = await server.ssrLoadModule('/src/luri-music/ProviderClient.js');
    const { sessionExpired } = await server.ssrLoadModule('/src/luri-music/session.js');
    const client = new ProviderClient({ id: 'p1' });
    globalThis.fetch = async () => Response.json({ error: '请先登录', code: 'login_required' }, { status: 401 });
    await assert.rejects(client.request('search', { q: 'x' }), (error) => error.code === 'login_required' && error.message === '登录已失效，请重新登录');
    assert.equal(reported, 1, 'The proxy reports an ended login');
    globalThis.fetch = async () => Response.json({ error: 'Provider rejected', code: 'provider_access_denied' }, { status: 401 });
    await assert.rejects(client.request('search', { q: 'x' }), (error) => error.code === 'provider_access_denied');
    assert.equal(reported, 1, 'A Provider rejection is not a session problem');
    globalThis.fetch = async () => Response.json({ error: '未找到可播放音源', code: 'no_candidate' }, { status: 400 });
    await assert.rejects(client.request('search', { q: 'x' }), (error) => error.code === 'no_candidate', 'Top-level proxy codes reach the player');
    assert.equal(await sessionExpired(Response.json({ code: 'login_required' }, { status: 401 })), true);
    assert.equal(await sessionExpired(Response.json({ error: '邮箱或密码错误' }, { status: 401 })), false, 'A failed sign-in is not an ended session');
    assert.equal(reported, 2);
  } finally {
    globalThis.fetch = originalFetch; globalThis.window = originalWindow;
    await server.close();
  }
});

test('the account shell signs this device out and asks to log in again', () => {
  const shell = readFileSync(new URL('../src/luri-music/LuriMusic.jsx', import.meta.url), 'utf8');
  assert.match(shell, /if \(!userRef\.current\) return;\s*userRef\.current = null;\s*clearAccountCache\(\); setUser\(null\); setProviders\(\[\]\);[\s\S]*?setAuthMode\('login'\); setDialog\('auth'\);[\s\S]*?notify\('登录已失效'/);
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  assert.match(music, /const providerDenied = \(error\) => !loginExpired\(error\) && /, 'An ended login never shows a Provider access message');
  assert.match(music, /if \(loginExpired\(error\)\) \{ setPlaying\(false\); setPlaybackState\('paused'\);/, 'Playback stops quietly instead of retrying or skipping');
  assert.equal((music.match(/error\?\.code === 'provider_access_denied' \|\| error\?\.status === 401/g) || []).length, 1, 'Every access check goes through providerDenied');
  const library = readFileSync(new URL('../src/luri-music/useMusicLibrary.js', import.meta.url), 'utf8');
  assert.equal((library.match(/if \(await sessionExpired\(response\)\) \{ setSyncState\('pending'\); return; \}/g) || []).length, 2, 'Library load and save keep local changes and stay quiet');
});
