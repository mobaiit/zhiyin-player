import { cookie, hash, id, json, now, passwordHash, sessionCookie, token, verifyPassword, verifyTurnstileToken } from './shared.js';
import { handleProviderRequest } from './providers.js';
import { handleFavoriteRequest } from './favorites.js';
import { publicSmtpConfig, saveSmtpConfig, sendSmtpTest, sendVerificationEmail } from './email.js';

const USER_COOKIE = 'zy_music_session';
const ADMIN_COOKIE = 'zy_music_admin';
const EMAIL_CODE_TTL = 10 * 60 * 1000;
const EMAIL_CODE_COOLDOWN = 60 * 1000;
const body = async (request) => request.json().catch(() => ({}));
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^\S+@\S+\.\S+$/.test(value);
const validPassword = (value) => typeof value === 'string' && value.length >= 8 && value.length <= 128;
const PLAYBACK_QUALITIES = new Set(['auto', '128k', '192k', '320k', 'flac', 'flac24bit']);
const ADMIN_ACTIONS = new Set([
  'admin/me',
  'admin/email-config',
  'admin/email-test',
  'admin/users',
  'admin/user-status',
  'admin/user-delete',
  'admin/users-cleanup',
  'admin/accounts',
  'admin/account-password',
  'admin/account-delete',
  'admin/password',
]);

const currentUser = async (request, env, includeFavorites = false) => {
  const value = cookie(request, USER_COOKIE);
  const favoriteFields = includeFavorites ? ',u.favorites_json,u.favorites_updated_at' : '';
  return value && env.LURI_MUSIC_DB.prepare(`SELECT u.id,u.email,u.display_name${favoriteFields} FROM luri_music_sessions s JOIN luri_music_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled_at IS NULL`).bind(await hash(value), now()).first();
};
const publicUser = (user) => user && ({ id: user.id, email: user.email, name: user.display_name });
const currentAdmin = async (request, env) => {
  const value = cookie(request, ADMIN_COOKIE);
  return value && env.LURI_MUSIC_DB.prepare('SELECT a.id,a.username FROM luri_music_admin_sessions s JOIN luri_music_admin_accounts a ON a.id=s.admin_account_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hash(value), now()).first();
};
const createSession = async (userId, env) => {
  const value = token();
  await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(id(), userId, await hash(value), new Date(Date.now() + 2592e6).toISOString(), now()).run();
  return value;
};
const userPayload = async (user) => {
  if (!user) return null;
  let favorites = []; try { favorites = JSON.parse(user.favorites_json || '[]'); } catch { /* Invalid legacy data is returned as an empty collection. */ }
  return { ...publicUser(user), favorites: Array.isArray(favorites) ? favorites : [], favoritesUpdatedAt: user.favorites_updated_at || null };
};
const verifyHuman = async (data, env) => {
  const result = await verifyTurnstileToken(data.turnstileToken, env);
  return result.success ? null : json({ error: result.reason === 'missing-token' ? '请先完成人机验证' : '人机验证未通过' }, 400);
};
const generateEmailCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const consumeEmailCode = async (env, mail, purpose, value) => {
  const row = await env.LURI_MUSIC_DB.prepare('SELECT id,code_hash,expires_at,attempts FROM luri_music_email_codes WHERE email=? AND purpose=?').bind(mail, purpose).first();
  if (!row || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5 || await hash(String(value || '').trim()) !== row.code_hash) {
    if (row) await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_email_codes SET attempts=attempts+1 WHERE id=?').bind(row.id).run();
    return null;
  }
  return row;
};

export async function handleLuriMusic(request, env) {
  if (!env.LURI_MUSIC_DB) return json({ error: '音乐服务尚未配置' }, 503);
  const pathname = new URL(request.url).pathname;
  const action = pathname.startsWith('/api/luri-music/') ? pathname.slice('/api/luri-music/'.length) : pathname.slice('/api/'.length);
  if (action === 'auth/me') { const user = await currentUser(request, env, true); return json({ user: await userPayload(user), turnstile: { enabled: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY), siteKey: env.TURNSTILE_SITE_KEY || '' } }); }
  if (action === 'preferences' && request.method === 'PATCH') {
    const user = await currentUser(request, env); if (!user) return json({ error: '请先登录' }, 401);
    const data = await body(request); const requestedQuality = String(data.playbackQuality || '').toLowerCase();
    if (!PLAYBACK_QUALITIES.has(requestedQuality)) return json({ error: '不支持的音质设置' }, 400);
    const playbackQuality = requestedQuality === 'auto' ? '128k' : requestedQuality;
    await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_preferences(user_id,playback_quality,provider_revision,updated_at) VALUES(?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET playback_quality=excluded.playback_quality,updated_at=excluded.updated_at').bind(user.id, playbackQuality, now()).run();
    return json({ playbackQuality });
  }
  if (action === 'favorites') return handleFavoriteRequest(request, env, await currentUser(request, env));
  if (action === 'providers' || action.startsWith('providers/')) return handleProviderRequest(request, env, action, await currentUser(request, env));

  if (action === 'auth/email-code' && request.method === 'POST') {
    const data = await body(request); const mail = normalizeEmail(data.email);
    const purpose = data.purpose === 'reset' ? 'reset' : data.purpose === 'register' ? 'register' : '';
    if (!isEmail(mail) || !purpose) return json({ error: '请输入有效邮箱' }, 400);
    await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_email_codes WHERE expires_at<=?').bind(now()).run();
    const existingUser = await env.LURI_MUSIC_DB.prepare('SELECT id FROM luri_music_users WHERE email=?').bind(mail).first();
    if (purpose === 'register' && existingUser) return json({ error: '该邮箱已注册' }, 409);
    if (purpose === 'reset' && !existingUser) return json({ ok: true, message: '如果该邮箱已注册，验证码将发送至邮箱' });
    const previous = await env.LURI_MUSIC_DB.prepare('SELECT last_sent_at FROM luri_music_email_codes WHERE email=? AND purpose=?').bind(mail, purpose).first();
    if (previous && Date.now() - Date.parse(previous.last_sent_at) < EMAIL_CODE_COOLDOWN) return json({ error: '发送过于频繁，请稍后再试' }, 429);
    const code = generateEmailCode();
    await sendVerificationEmail(env, mail, purpose, code);
    const timestamp = now();
    await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_email_codes(id,email,purpose,code_hash,expires_at,last_sent_at,attempts,created_at) VALUES(?,?,?,?,?,?,0,?) ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at,attempts=0,created_at=excluded.created_at').bind(id(), mail, purpose, await hash(code), new Date(Date.now() + EMAIL_CODE_TTL).toISOString(), timestamp, timestamp).run();
    return json({ ok: true, message: '验证码已发送，有效期 10 分钟' });
  }

  if (action === 'auth/register' && request.method === 'POST') {
    const data = await body(request); const mail = normalizeEmail(data.email); const name = String(data.name || '').trim().slice(0, 40);
    if (!isEmail(mail) || !name || !validPassword(data.password)) return json({ error: '请填写名称、有效邮箱和至少 8 位密码' }, 400);
    const human = await verifyHuman(data, env); if (human) return human;
    const emailCode = await consumeEmailCode(env, mail, 'register', data.emailCode);
    if (!emailCode) return json({ error: '邮箱验证码错误或已过期' }, 400);
    const userId = id();
    try { const timestamp = now(); await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_users(id,email,display_name,password_hash,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?,?)').bind(userId, mail, name, await passwordHash(data.password), timestamp, timestamp, timestamp).run(); }
    catch { return json({ error: '该邮箱已注册' }, 409); }
    await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_email_codes WHERE id=?').bind(emailCode.id).run();
    const value = await createSession(userId, env);
    return json({ user: { id: userId, email: mail, name, favorites: [], favoritesUpdatedAt: null } }, 201, { 'set-cookie': sessionCookie(USER_COOKIE, value, 2592000) });
  }

  if (action === 'auth/login' && request.method === 'POST') {
    const data = await body(request); const registered = data.turnstileToken === '__skip__' ? await currentUser(request, env) : null;
    const canSkip = Boolean(registered && normalizeEmail(registered.email) === normalizeEmail(data.email));
    const human = canSkip ? null : await verifyHuman(data, env); if (human) return human;
    const user = await env.LURI_MUSIC_DB.prepare('SELECT * FROM luri_music_users WHERE email=?').bind(normalizeEmail(data.email)).first();
    if (!user || !await verifyPassword(data.password || '', user.password_hash)) return json({ error: '邮箱或密码错误' }, 401);
    if (user.disabled_at) return json({ error: '账号已被禁用，请联系管理员' }, 403);
    await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_users SET last_login_at=?,updated_at=? WHERE id=?').bind(now(), now(), user.id).run();
    const value = await createSession(user.id, env);
    return json({ user: await userPayload(user) }, 200, { 'set-cookie': sessionCookie(USER_COOKIE, value, 2592000) });
  }

  if (action === 'auth/reset-password' && request.method === 'POST') {
    const data = await body(request); const mail = normalizeEmail(data.email);
    if (!isEmail(mail) || !validPassword(data.password)) return json({ error: '请输入有效邮箱和至少 8 位新密码' }, 400);
    const human = await verifyHuman(data, env); if (human) return human;
    const emailCode = await consumeEmailCode(env, mail, 'reset', data.emailCode);
    if (!emailCode) return json({ error: '邮箱验证码错误或已过期' }, 400);
    const user = await env.LURI_MUSIC_DB.prepare('SELECT id FROM luri_music_users WHERE email=?').bind(mail).first();
    if (!user) return json({ error: '邮箱验证码错误或已过期' }, 400);
    await env.LURI_MUSIC_DB.batch([
      env.LURI_MUSIC_DB.prepare('UPDATE luri_music_users SET password_hash=?,updated_at=? WHERE id=?').bind(await passwordHash(data.password), now(), user.id),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_sessions WHERE user_id=?').bind(user.id),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_email_codes WHERE id=?').bind(emailCode.id),
    ]);
    return json({ ok: true });
  }

  if (action === 'auth/logout') return json({ ok: true }, 200, { 'set-cookie': sessionCookie(USER_COOKIE, '', 0) });
  if (action === 'admin/logout') return json({ ok: true }, 200, { 'set-cookie': sessionCookie(ADMIN_COOKIE, '', 0) });
  if (action === 'auth/password' && request.method === 'POST') {
    const user = await currentUser(request, env); const data = await body(request);
    if (!user) return json({ error: '请先登录' }, 401);
    const row = await env.LURI_MUSIC_DB.prepare('SELECT password_hash FROM luri_music_users WHERE id=?').bind(user.id).first();
    if (!await verifyPassword(data.currentPassword || '', row.password_hash)) return json({ error: '旧密码错误' }, 400);
    if (!validPassword(data.password)) return json({ error: '新密码至少需要 8 位' }, 400);
    await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_users SET password_hash=?,updated_at=? WHERE id=?').bind(await passwordHash(data.password), now(), user.id).run();
    return json({ ok: true });
  }

  if (action === 'admin/login' && request.method === 'POST') {
    const data = await body(request); const human = await verifyHuman(data, env); if (human) return human;
    const username = String(data.username || '').trim().toLowerCase();
    let account = await env.LURI_MUSIC_DB.prepare('SELECT id,username,password_hash FROM luri_music_admin_accounts WHERE username=?').bind(username).first();
    if (!account && env.ADMIN_BOOTSTRAP_PASSWORD && username === String(env.ADMIN_BOOTSTRAP_USERNAME || 'admin').trim().toLowerCase() && data.password === env.ADMIN_BOOTSTRAP_PASSWORD) {
      const count = await env.LURI_MUSIC_DB.prepare('SELECT count(*) n FROM luri_music_admin_accounts').first();
      if (!Number(count?.n || 0)) {
        const accountId = id(); const timestamp = now(); const password = await passwordHash(data.password);
        await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').bind(accountId, username, password, timestamp, timestamp).run();
        account = { id: accountId, username, password_hash: password };
      }
    }
    if (!account || !await verifyPassword(data.password || '', account.password_hash)) return json({ error: '账号或密码错误' }, 401);
    const value = token();
    await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_admin_sessions(id,token_hash,expires_at,created_at,admin_account_id) VALUES(?,?,?,?,?)').bind(id(), await hash(value), new Date(Date.now() + 288e5).toISOString(), now(), account.id).run();
    return json({ ok: true, admin: { id: account.id, username: account.username } }, 200, { 'set-cookie': sessionCookie(ADMIN_COOKIE, value, 28800) });
  }

  if (!ADMIN_ACTIONS.has(action)) return json({ error: 'Not found' }, 404);
  const admin = await currentAdmin(request, env);
  if (!admin) return json({ error: '管理员登录已失效' }, 401);
  if (action === 'admin/me' && request.method === 'GET') return json({ admin: { id: admin.id, username: admin.username } });
  if (action === 'admin/email-config' && request.method === 'GET') {
    return json(await publicSmtpConfig(env));
  }
  if (action === 'admin/email-config' && request.method === 'POST') {
    try { return json(await saveSmtpConfig(env, await body(request))); }
    catch (error) { return json({ error: error.message || 'SMTP 配置无效' }, 400); }
  }
  if (action === 'admin/email-test' && request.method === 'POST') {
    try { const data = await body(request); await sendSmtpTest(env, normalizeEmail(data.recipient)); return json({ sent: true }); }
    catch (error) { return json({ error: error.message || '测试邮件发送失败' }, 503); }
  }

  if (action === 'admin/users' && request.method === 'GET') {
    const url = new URL(request.url); const query = String(url.searchParams.get('query') || '').trim(); const status = url.searchParams.get('status') || ''; const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const size = 20;
    const where = ['1=1']; const args = [];
    if (query) { where.push('(u.email LIKE ? OR u.display_name LIKE ?)'); args.push(`%${query}%`, `%${query}%`); }
    if (status === 'disabled') where.push('u.disabled_at IS NOT NULL');
    if (status === 'active') where.push('u.disabled_at IS NULL');
    const condition = where.join(' AND ');
    const total = await env.LURI_MUSIC_DB.prepare(`SELECT count(*) n FROM luri_music_users u WHERE ${condition}`).bind(...args).first();
    const rows = await env.LURI_MUSIC_DB.prepare(`SELECT u.id,u.email,u.display_name,u.created_at,u.last_login_at,u.disabled_at,(SELECT count(*) FROM luri_music_provider_configs pc WHERE pc.user_id=u.id) provider_count,(SELECT pc.display_name FROM luri_music_preferences pref JOIN luri_music_provider_configs pc ON pc.id=pref.active_provider_config_id WHERE pref.user_id=u.id) active_provider FROM luri_music_users u WHERE ${condition} ORDER BY COALESCE(u.last_login_at,u.created_at) DESC LIMIT ? OFFSET ?`).bind(...args, size, (page - 1) * size).all();
    return json({ items: rows.results.map((user) => ({ ...user, status: user.disabled_at ? '已禁用' : '正常' })), total: total.n, page, size });
  }
  if (action === 'admin/user-status' && request.method === 'POST') {
    const data = await body(request); const account = await env.LURI_MUSIC_DB.prepare('SELECT id FROM luri_music_users WHERE id=?').bind(data.id).first();
    if (!account) return json({ error: '用户不存在' }, 404);
    await env.LURI_MUSIC_DB.prepare(`UPDATE luri_music_users SET disabled_at=${data.disabled ? '?' : 'NULL'},updated_at=? WHERE id=?`).bind(...(data.disabled ? [now(), now(), data.id] : [now(), data.id])).run();
    if (data.disabled) await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_sessions WHERE user_id=?').bind(data.id).run();
    return json({ ok: true });
  }
  if (action === 'admin/user-delete' && request.method === 'POST') {
    const data = await body(request); const account = await env.LURI_MUSIC_DB.prepare('SELECT id,email FROM luri_music_users WHERE id=?').bind(data.id).first();
    if (!account) return json({ error: '用户不存在' }, 404);
    await env.LURI_MUSIC_DB.batch([
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_preferences WHERE user_id=?').bind(account.id),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_provider_configs WHERE user_id=?').bind(account.id),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_sessions WHERE user_id=?').bind(account.id),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_email_codes WHERE email=?').bind(account.email),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_users WHERE id=?').bind(account.id),
    ]);
    return json({ ok: true });
  }
  if (action === 'admin/users-cleanup' && request.method === 'POST') {
    const data = await body(request); const years = Math.min(100, Math.max(1, Math.floor(Number(data.years) || 0)));
    if (!years) return json({ error: '请输入有效年数' }, 400);
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - years); const cutoffValue = cutoff.toISOString();
    const total = await env.LURI_MUSIC_DB.prepare('SELECT count(*) n FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?').bind(cutoffValue).first();
    await env.LURI_MUSIC_DB.batch([
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_preferences WHERE user_id IN (SELECT id FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?)').bind(cutoffValue),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_provider_configs WHERE user_id IN (SELECT id FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?)').bind(cutoffValue),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_sessions WHERE user_id IN (SELECT id FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?)').bind(cutoffValue),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_email_codes WHERE email IN (SELECT email FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?)').bind(cutoffValue),
      env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_users WHERE COALESCE(last_login_at,created_at)<=?').bind(cutoffValue),
    ]);
    return json({ ok: true, deleted: total.n, cutoff: cutoffValue });
  }
  if (action === 'admin/accounts' && request.method === 'GET') {
    const rows = await env.LURI_MUSIC_DB.prepare('SELECT id,username,created_at,updated_at FROM luri_music_admin_accounts ORDER BY created_at').all();
    return json({ items: rows.results, currentId: admin.id });
  }
  if (action === 'admin/accounts' && request.method === 'POST') {
    const data = await body(request); const username = String(data.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(username) || !validPassword(data.password)) return json({ error: '账号需为 3—32 位字母、数字或 . _ -，密码至少 8 位' }, 400);
    try { await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_admin_accounts(id,username,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id(), username, await passwordHash(data.password), now(), now()).run(); }
    catch { return json({ error: '管理员账号已存在' }, 409); }
    return json({ ok: true });
  }
  if (action === 'admin/account-password' && request.method === 'POST') {
    const data = await body(request); if (!validPassword(data.password)) return json({ error: '新密码至少需要 8 位' }, 400);
    const result = await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_admin_accounts SET password_hash=?,updated_at=? WHERE id=?').bind(await passwordHash(data.password), now(), data.id).run();
    if (!result.meta.changes) return json({ error: '管理员账号不存在' }, 404);
    await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_admin_sessions WHERE admin_account_id=? AND admin_account_id<>?').bind(data.id, admin.id).run();
    return json({ ok: true });
  }
  if (action === 'admin/account-delete' && request.method === 'POST') {
    const data = await body(request); if (data.id === admin.id) return json({ error: '不能删除当前登录账号' }, 400);
    const total = await env.LURI_MUSIC_DB.prepare('SELECT count(*) n FROM luri_music_admin_accounts').first();
    if (total.n <= 1) return json({ error: '至少保留一个管理员账号' }, 400);
    await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_admin_sessions WHERE admin_account_id=?').bind(data.id).run();
    const result = await env.LURI_MUSIC_DB.prepare('DELETE FROM luri_music_admin_accounts WHERE id=?').bind(data.id).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: '管理员账号不存在' }, 404);
  }
  if (action === 'admin/password' && request.method === 'POST') {
    const data = await body(request); const credentials = await env.LURI_MUSIC_DB.prepare('SELECT password_hash FROM luri_music_admin_accounts WHERE id=?').bind(admin.id).first();
    if (!credentials || !await verifyPassword(data.currentPassword || '', credentials.password_hash)) return json({ error: '当前密码错误' }, 400);
    if (!validPassword(data.newPassword)) return json({ error: '新密码至少需要 8 位' }, 400);
    const password = await passwordHash(data.newPassword);
    await env.LURI_MUSIC_DB.prepare('UPDATE luri_music_admin_accounts SET password_hash=?,updated_at=? WHERE id=?').bind(password, now(), admin.id).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
