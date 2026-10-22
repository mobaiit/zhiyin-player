const PROVIDER_ERROR_MESSAGES = {
  connection_credential_bound: '该连接凭据已绑定其他 ZY MUSIC 账号，请使用原账号或更换凭据',
  invalid_connection_credential: '连接凭据无效或当前不可用，请检查后重试',
  activation_code_used: '该连接凭据已绑定其他 ZY MUSIC 账号，请使用原账号或更换凭据',
  invalid_activation_code: '连接凭据无效或当前不可用，请检查后重试',
  access_denied: 'Provider 拒绝了当前认证信息，请检查后重试',
  provider_access_denied: 'Provider 拒绝了当前认证信息，请检查后重试',
};

const providerMessage = (code, fallback) => PROVIDER_ERROR_MESSAGES[code] || fallback;

const api = async (path, options = {}) => {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error && typeof data.error === 'object' ? data.error : null;
    const code = detail?.code || data.code || (response.status === 401 || response.status === 403 ? 'provider_access_denied' : 'provider_request_failed');
    const error = new Error(providerMessage(code, detail?.message || data.error || 'Provider 配置读取失败'));
    error.status = response.status;
    error.code = code;
    throw error;
  }
  return data;
};

const PROVIDER_REQUEST_TIMEOUT_MS = 60 * 1000;
const PLAYBACK_CACHE_SAFETY_MS = 5 * 1000;
const FORBIDDEN_HEADERS = new Set(['cookie', 'host', 'origin', 'referer', 'user-agent', 'content-length', 'connection']);
const isRefreshRequest = (value) => value === true || value === 1 || value === '1' || value === 'url' || value === 'decode';
const providerCache = () => { try { return globalThis.localStorage || null; } catch { return null; } };

const requestDeadline = (signal) => {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) relayAbort();
  else signal?.addEventListener('abort', relayAbort, { once: true });
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, PROVIDER_REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear: () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', relayAbort);
    },
  };
};

const providerError = async (response) => {
  if (response.ok) return response;
  const data = await response.clone().json().catch(() => ({}));
  const detail = data.error && typeof data.error === 'object' ? data.error : null;
  const code = detail?.code || (response.status === 401 || response.status === 403 ? 'provider_access_denied' : 'provider_request_failed');
  const error = new Error(providerMessage(code, detail?.message || data.error || `Provider 请求失败（${response.status}）`));
  error.status = response.status;
  error.code = code;
  throw error;
};

export function normalizeProviderConnection(value) {
  const input = typeof value === 'string' ? JSON.parse(value) : value;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provider 配置必须是 JSON 对象');
  const url = new URL(String(input.url || '').trim());
  if (url.protocol !== 'https:') throw new Error('Provider 必须使用 HTTPS');
  if (url.username || url.password) throw new Error('Provider URL 不允许包含用户名或密码');
  url.hash = '';

  const headers = {};
  if (input.headers !== undefined && (!input.headers || typeof input.headers !== 'object' || Array.isArray(input.headers))) throw new Error('headers 必须是 JSON 对象');
  for (const [rawName, rawValue] of Object.entries(input.headers || {})) {
    const name = String(rawName).trim();
    const lower = name.toLowerCase();
    if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name) || FORBIDDEN_HEADERS.has(lower) || lower.startsWith('sec-') || lower.startsWith('proxy-')) throw new Error(`不支持请求头 ${name}`);
    const headerValue = String(rawValue);
    if (headerValue.length > 2048 || /[\r\n]/.test(headerValue)) throw new Error(`请求头 ${name} 的值不合法`);
    headers[name] = headerValue;
  }
  if (Object.keys(headers).length > 20) throw new Error('自定义请求头不能超过 20 个');

  const credentials = input.credentials || 'omit';
  if (!['omit', 'same-origin', 'include'].includes(credentials)) throw new Error('credentials 仅支持 omit、same-origin 或 include');
  return { url: url.href, headers, credentials };
}

export async function verifyProviderConnection(connectionInput, clientAccount, signal) {
  const deadline = requestDeadline(signal);
  try {
    return await api('providers/verify', {
      method: 'POST',
      body: JSON.stringify({ connection: normalizeProviderConnection(connectionInput), clientAccount }),
      signal: deadline.signal,
    });
  } catch (error) {
    if (deadline.timedOut()) {
      const timeoutError = new Error('Provider 连接验证超时（60 秒）');
      timeoutError.code = 'provider_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    deadline.clear();
  }
}

export default class ProviderClient {
  constructor(config, onStatusChange) {
    this.config = config;
    this.onStatusChange = onStatusChange;
  }

  cacheKey(kind, params) {
    if (!['resolve', 'lyrics', 'artwork'].includes(kind) || !params.songId) return '';
    return kind === 'resolve'
      ? `luri.song-cache.v2:${kind}:${params.songId}`
      : `luri.song-cache.v1:${kind}:${params.songId}:`;
  }

  invalidateCache(kind, params = {}) {
    const key = this.cacheKey(kind, params);
    if (!key) return;
    try { providerCache()?.removeItem(key); } catch { /* Local storage may be unavailable. */ }
  }

  cachedResponse(key, refresh) {
    if (!key) return null;
    try {
      const storage = providerCache();
      if (!storage) return null;
      if (refresh) { storage.removeItem(key); return null; }
      const entry = JSON.parse(storage.getItem(key) || 'null');
      const expiresAt = Number(entry?.expiresAt);
      const expiring = Number.isFinite(expiresAt) && expiresAt > 0;
      if (!entry || (expiring && expiresAt <= Date.now())) { storage.removeItem(key); return null; }
      const responseBody = { ...entry.body };
      if (entry.kind === 'resolve' && responseBody.url) {
        if (!expiring) { storage.removeItem(key); return null; }
        responseBody.expiresIn = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
      } else if (entry.kind === 'resolve') {
        storage.removeItem(key);
        return null;
      }
      return new Response(JSON.stringify(responseBody), { status: 200, headers: { 'content-type': 'application/json', 'x-luri-cache': 'local' } });
    } catch { return null; }
  }

  rememberResponse(key, kind, response) {
    if (!key || !response.ok) return;
    response.clone().json().then((payload) => {
      const useful = kind === 'resolve' ? payload.url : kind === 'artwork' ? payload.url : payload.lyrics || payload.translation;
      if (!useful) return;
      const current = Date.now();
      let expiresAt = current + 3600 * 1000;
      if (kind === 'resolve') {
        const reportedExpiry = Date.parse(payload.expiresAt || '');
        const reportedTtl = Number(payload.expiresIn);
        if (Number.isFinite(reportedExpiry)) {
          expiresAt = reportedExpiry - PLAYBACK_CACHE_SAFETY_MS;
          if (expiresAt <= current) return;
        } else if (Number.isFinite(reportedTtl) && reportedTtl > 0) {
          expiresAt = current + reportedTtl * 1000 - PLAYBACK_CACHE_SAFETY_MS;
          if (expiresAt <= current) return;
        } else return;
      }
      try { providerCache()?.setItem(key, JSON.stringify({ kind, expiresAt, body: payload })); } catch { /* Local storage may be unavailable. */ }
    }).catch(() => {});
  }

  async request(kind, params = {}, signal) {
    const cacheKey = this.cacheKey(kind, params);
    const cached = this.cachedResponse(cacheKey, isRefreshRequest(params.refresh));
    if (cached) return cached;
    const deadline = requestDeadline(signal);
    try {
      const response = await providerError(await fetch(`/api/providers/${encodeURIComponent(this.config.id)}/proxy`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, params }),
        signal: deadline.signal,
      }));
      this.rememberResponse(cacheKey, kind, response);
      return response;
    } catch (error) {
      if (!deadline.timedOut()) throw error;
      const timeout = new Error('Provider 请求超时（60 秒）');
      timeout.code = 'provider_timeout';
      timeout.status = 504;
      throw timeout;
    } finally {
      deadline.clear();
    }
  }
}
