const SMTP_SETTING = 'smtp_config_v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (value) => btoa(String.fromCharCode(...value));
const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const validEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || ''));

async function encryptionKey(env) {
  if (!env.PROVIDER_CREDENTIAL_KEY) throw new Error('请先配置 PROVIDER_CREDENTIAL_KEY，用于加密 SMTP 密码');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(env.PROVIDER_CREDENTIAL_KEY));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptConfig(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) });
}

async function decryptConfig(value, env) {
  const payload = JSON.parse(value);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, await encryptionKey(env), fromBase64(payload.ciphertext));
  return JSON.parse(decoder.decode(plain));
}

function environmentConfig(env) {
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  return {
    host: String(env.SMTP_HOST),
    port: Number(env.SMTP_PORT || 465),
    secure: String(env.SMTP_SECURE ?? 'true') !== 'false',
    authType: ['plain', 'login', 'cram-md5'].includes(env.SMTP_AUTH_TYPE) ? env.SMTP_AUTH_TYPE : 'plain',
    username: String(env.SMTP_USERNAME || ''),
    password: String(env.SMTP_PASSWORD || ''),
    from: String(env.SMTP_FROM),
    fromName: String(env.SMTP_FROM_NAME || '知音'),
    replyTo: String(env.SMTP_REPLY_TO || ''),
  };
}

export async function smtpConfig(env) {
  const setting = await env.LURI_MUSIC_DB.prepare('SELECT value FROM luri_music_settings WHERE key=?').bind(SMTP_SETTING).first();
  if (setting?.value) return { ...(await decryptConfig(setting.value, env)), source: 'database' };
  const config = environmentConfig(env);
  return config ? { ...config, source: 'environment' } : null;
}

export async function publicSmtpConfig(env) {
  const config = await smtpConfig(env);
  if (!config) return { configured: false, source: 'none', host: '', port: 465, secure: true, authType: 'plain', username: '', passwordConfigured: false, from: 'no-reply@zhiyin.us.ci', fromName: '知音', replyTo: '' };
  return { configured: true, source: config.source, host: config.host, port: config.port, secure: config.secure, authType: config.authType, username: config.username, passwordConfigured: Boolean(config.password), from: config.from, fromName: config.fromName, replyTo: config.replyTo };
}

function normalizeConfig(data, password = '') {
  const config = {
    host: String(data.host || '').trim(),
    port: Number(data.port),
    secure: data.secure !== false,
    authType: ['plain', 'login', 'cram-md5'].includes(data.authType) ? data.authType : 'plain',
    username: String(data.username || '').trim(),
    password: String(data.password || password),
    from: String(data.from || '').trim().toLowerCase(),
    fromName: String(data.fromName || '知音').trim().slice(0, 100),
    replyTo: String(data.replyTo || '').trim().toLowerCase(),
  };
  if (!config.host || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('SMTP 主机或端口无效');
  if (!validEmail(config.from) || (config.replyTo && !validEmail(config.replyTo))) throw new Error('发件邮箱或回复邮箱无效');
  if (config.username && !config.password) throw new Error('请输入 SMTP 密码或授权码');
  return config;
}

function friendlySmtpError(error) {
  const message = String(error?.message || error || '');
  if (/535|authentication credentials invalid|invalid (?:login|credentials)|auth(?:entication)? (?:failed|error)/i.test(message)) {
    return new Error('SMTP 认证失败。请确认用户名填写完整邮箱，并使用邮箱服务商生成的 SMTP 授权码（通常不是网页登录密码）；修改后请先保存配置再测试。');
  }
  if (/550|553|sender.*(?:denied|rejected)|from.*(?:denied|rejected|not allowed)/i.test(message)) {
    return new Error('发件地址被 SMTP 服务商拒绝。请将“发件邮箱”改为当前 SMTP 账号或已验证的发件地址。');
  }
  if (/certificate|tls|ssl|starttls/i.test(message)) {
    return new Error('SMTP 加密连接失败。465 端口请启用 TLS/SSL；587 端口请关闭该选项以使用 STARTTLS。');
  }
  if (/timeout|timed out/i.test(message)) {
    return new Error('连接 SMTP 服务器超时。请检查主机、端口和网络限制，稍后重试。');
  }
  if (/connect|econnrefused|enotfound|dns/i.test(message)) {
    return new Error('无法连接 SMTP 服务器。请检查 SMTP 主机和端口是否正确、服务是否已开启。');
  }
  return new Error('测试邮件发送失败。请检查 SMTP 主机、端口、加密方式、用户名和授权码后重试。');
}

export async function saveSmtpConfig(env, data) {
  const current = await smtpConfig(env).catch(() => null);
  const config = normalizeConfig(data, current?.source === 'database' ? current.password : '');
  const value = await encryptConfig(config, env);
  const timestamp = new Date().toISOString();
  await env.LURI_MUSIC_DB.prepare('INSERT INTO luri_music_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(SMTP_SETTING, value, timestamp).run();
  return publicSmtpConfig(env);
}

async function send(env, recipient, subject, text, html) {
  const config = await smtpConfig(env);
  if (!config) throw new Error('邮件服务尚未配置');
  const { WorkerMailer } = await import('worker-mailer');
  try {
    await WorkerMailer.send({
      host: config.host,
      port: config.port,
      secure: config.secure,
      startTls: !config.secure,
      credentials: config.username ? { username: config.username, password: config.password } : undefined,
      authType: config.authType,
      socketTimeoutMs: 15000,
      responseTimeoutMs: 15000,
    }, {
      from: { email: config.from, name: config.fromName || '知音' },
      to: recipient,
      reply: config.replyTo || undefined,
      subject,
      text,
      html,
    });
  } catch (error) {
    throw friendlySmtpError(error);
  }
}

export async function sendVerificationEmail(env, recipient, purpose, code) {
  const action = purpose === 'register' ? '注册账号' : '重置密码';
  const text = `你正在进行知音${action}，验证码为：${code}。验证码 10 分钟内有效，请勿转发给他人。`;
  const html = `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#24134f;line-height:1.7"><h2 style="margin:0 0 18px;color:#6d28d9">知音</h2><p>你正在${action}，验证码为：</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0;color:#ea580c">${code}</p><p>验证码 10 分钟内有效，请勿转发给他人。如非本人操作，请忽略本邮件。</p></div>`;
  await send(env, recipient, `知音${action}验证码`, text, html);
}

export async function sendSmtpTest(env, recipient) {
  if (!validEmail(recipient)) throw new Error('请输入有效的测试收件邮箱');
  await send(env, recipient, '知音 SMTP 测试', '这是一封来自知音的 SMTP 测试邮件。收到此邮件表示配置可用。', '<h2>知音</h2><p>这是一封 SMTP 测试邮件。收到此邮件表示配置可用。</p>');
}
