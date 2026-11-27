import { id, json, now } from './shared.js';

// Client keys a Provider issued to Zhiyin (MPP client signature). One row per Provider origin;
// the secret is encrypted with PROVIDER_CREDENTIAL_KEY like the Provider credentials.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const toBase64 = (value) => btoa(String.fromCharCode(...value));
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const CACHE_TTL_MS = 60_000;

async function secretKey(env) {
  if (!env.PROVIDER_CREDENTIAL_KEY) throw new Error('Provider 凭证加密密钥尚未配置');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(env.PROVIDER_CREDENTIAL_KEY));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptSecret(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await secretKey(env), encoder.encode(String(value)));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}
async function decryptSecret(row, env) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(row.secret_iv) }, await secretKey(env), fromBase64(row.secret_ciphertext));
  return decoder.decode(plain);
}

let cache = null;
export function clearProviderClientCache() { cache = null; }

// Enabled keys by Provider origin, kept per instance for a minute. Before the migration (or
// with a broken key) the list is empty and requests go out unsigned, as before.
async function enabledClients(env) {
  if (cache && cache.until > Date.now()) return cache.clients;
  let clients = [];
  try {
    const rows = (await env.LURI_MUSIC_DB.prepare('SELECT * FROM luri_music_provider_clients WHERE enabled=1').all()).results || [];
    clients = (await Promise.all(rows.map(async (row) => ({ origin: row.provider_origin, key: row.client_key, secret: await decryptSecret(row, env).catch(() => '') })))).filter((client) => client.secret);
  } catch (error) { console.warn('Provider client keys unavailable', error?.message || error); }
  cache = { clients, until: Date.now() + CACHE_TTL_MS };
  return clients;
}

// MPP client signature headers for a request to a Provider, or null when no key is configured.
// The discovery document stays public and is never signed.
export async function clientSignatureHeaders(env, target, method = 'GET', body = '') {
  if (!env?.LURI_MUSIC_DB || target.pathname.startsWith('/.well-known/')) return null;
  const client = (await enabledClients(env)).find((item) => item.origin === target.origin);
  if (!client) return null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(typeof body === 'string' ? body : '')));
  const key = await crypto.subtle.importKey('raw', encoder.encode(client.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const content = [String(method).toUpperCase(), `${target.pathname}${target.search}`, timestamp, bodyHash].join('\n');
  return { 'X-Client-Id': client.key, 'X-Client-Timestamp': timestamp, 'X-Client-Signature': hex(await crypto.subtle.sign('HMAC', key, encoder.encode(content))) };
}

const publicClient = (row) => ({ id: row.id, providerOrigin: row.provider_origin, clientKey: row.client_key, enabled: Boolean(row.enabled), secretHint: row.secret_hint || '', createdAt: row.created_at, updatedAt: row.updated_at });

function cleanInput(data, existing = null) {
  let origin;
  try { origin = new URL(String(data.providerOrigin ?? existing?.provider_origin ?? '').trim()); } catch { throw new Error('请填写 Provider 地址，例如 https://provider.example'); }
  if (origin.protocol !== 'https:') throw new Error('Provider 地址必须使用 HTTPS');
  const clientKey = String(data.clientKey ?? existing?.client_key ?? '').trim();
  if (!/^[\x21-\x7e]{3,128}$/.test(clientKey)) throw new Error('Key 需为 3-128 个可见字符，不含空格');
  const secret = data.secret === undefined || data.secret === null ? '' : String(data.secret);
  if (!existing && !secret) throw new Error('请填写 Secret');
  if (secret && !/^[\x21-\x7e]{32,256}$/.test(secret)) throw new Error('Secret 需为 32-256 个可见字符，不含空格');
  return { providerOrigin: origin.origin, clientKey, secret, enabled: data.enabled === undefined ? existing ? Boolean(existing.enabled) : true : Boolean(data.enabled) };
}

const listClients = async (env) => ((await env.LURI_MUSIC_DB.prepare('SELECT * FROM luri_music_provider_clients ORDER BY created_at,id').all()).results || []).map(publicClient);

// Admin actions: admin/provider-clients (GET list, POST create or update),
// admin/provider-client-secret (POST reveal) and admin/provider-client-delete (POST).
export async function handleProviderClientAdmin(request, env, action, body) {
  const db = env.LURI_MUSIC_DB;
  if (action === 'admin/provider-clients' && request.method === 'GET') return json({ items: await listClients(env) });
  const data = await body(request);
  const existing = data.id ? await db.prepare('SELECT * FROM luri_music_provider_clients WHERE id=?').bind(String(data.id)).first() : null;
  if (data.id && !existing) return json({ error: 'Provider 接入密钥不存在' }, 404);
  if (action === 'admin/provider-clients' && request.method === 'POST') {
    let input; try { input = cleanInput(data, existing); } catch (error) { return json({ error: error.message }, 400); }
    const taken = await db.prepare('SELECT id FROM luri_music_provider_clients WHERE provider_origin=? AND id<>?').bind(input.providerOrigin, existing?.id || '').first();
    if (taken) return json({ error: '该 Provider 地址已有接入密钥，请编辑现有配置' }, 409);
    const timestamp = now(); const secret = input.secret ? await encryptSecret(input.secret, env) : null; const hint = input.secret ? input.secret.slice(-4) : existing?.secret_hint || '';
    if (existing) {
      await db.prepare(`UPDATE luri_music_provider_clients SET provider_origin=?,client_key=?,enabled=?,secret_hint=?,updated_at=?${secret ? ',secret_ciphertext=?,secret_iv=?' : ''} WHERE id=?`).bind(input.providerOrigin, input.clientKey, input.enabled ? 1 : 0, hint, timestamp, ...(secret ? [secret.ciphertext, secret.iv] : []), existing.id).run();
    } else {
      await db.prepare('INSERT INTO luri_music_provider_clients(id,provider_origin,client_key,secret_ciphertext,secret_iv,secret_hint,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id(), input.providerOrigin, input.clientKey, secret.ciphertext, secret.iv, hint, input.enabled ? 1 : 0, timestamp, timestamp).run();
    }
    clearProviderClientCache();
    return json({ items: await listClients(env) });
  }
  if (!existing) return json({ error: '请指定 Provider 接入密钥' }, 400);
  if (action === 'admin/provider-client-secret' && request.method === 'POST') {
    try { return json({ secret: await decryptSecret(existing, env) }, 200, { 'cache-control': 'no-store' }); }
    catch { return json({ error: 'Secret 无法解密，请重新设置' }, 500); }
  }
  if (action === 'admin/provider-client-delete' && request.method === 'POST') {
    await db.prepare('DELETE FROM luri_music_provider_clients WHERE id=?').bind(existing.id).run();
    clearProviderClientCache();
    return json({ items: await listClients(env) });
  }
  return json({ error: 'Not found' }, 404);
}
