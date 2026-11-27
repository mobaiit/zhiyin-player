import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearProviderClientCache, clientSignatureHeaders, handleProviderClientAdmin } from '../functions/luri-music/provider-clients.js';
import { handleLuriMusic } from '../functions/luri-music/index.js';

const SECRET = 'zhiyin-secret-zhiyin-secret-zhiyin-secret';
const encoder = new TextEncoder();
const toBase64 = (value) => Buffer.from(value).toString('base64');

async function encrypted(value, key) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(key));
  const cryptoKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { secret_ciphertext: toBase64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(value)))), secret_iv: toBase64(iv) };
}

// Answers the queries provider-clients.js makes and records writes.
function fakeDatabase(rows) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      return {
        values: [],
        bind(...values) { this.values = values; return this; },
        async all() { return { results: sql.includes('WHERE enabled=1') ? rows.filter((row) => row.enabled) : rows }; },
        async first() { return sql.startsWith('SELECT * FROM luri_music_provider_clients WHERE id=?') ? rows.find((row) => row.id === this.values[0]) || null : null; },
        async run() { writes.push({ sql, values: this.values }); return { meta: { changes: 1 } }; },
      };
    },
  };
}

test('requests to a configured Provider carry the MPP client signature that music-api verifies', async () => {
  clearProviderClientCache();
  const env = { PROVIDER_CREDENTIAL_KEY: 'credential-key', LURI_MUSIC_DB: fakeDatabase([{ id: 'c1', provider_origin: 'https://togame.cc.cd', client_key: 'zhiyin', enabled: 1, ...(await encrypted(SECRET, 'credential-key')) }]) };
  const target = new URL('https://togame.cc.cd/v1/tracks/resolve');
  const body = JSON.stringify({ songId: 'x' });
  const headers = await clientSignatureHeaders(env, target, 'POST', body);
  assert.equal(headers['X-Client-Id'], 'zhiyin');
  const expected = createHmac('sha256', SECRET).update(['POST', '/v1/tracks/resolve', headers['X-Client-Timestamp'], createHash('sha256').update(body).digest('hex')].join('\n')).digest('hex');
  assert.equal(headers['X-Client-Signature'], expected);
  assert.equal(await clientSignatureHeaders(env, new URL('https://togame.cc.cd/.well-known/music-provider.json')), null, 'Discovery stays public');
  assert.equal(await clientSignatureHeaders(env, new URL('https://other.example/v1/catalog/search?q=a')), null, 'Other Providers are not signed');
  const query = await clientSignatureHeaders(env, new URL('https://togame.cc.cd/v1/catalog/search?q=%E6%9E%97&page=1'));
  const queryExpected = createHmac('sha256', SECRET).update(['GET', '/v1/catalog/search?q=%E6%9E%97&page=1', query['X-Client-Timestamp'], createHash('sha256').update('').digest('hex')].join('\n')).digest('hex');
  assert.equal(query['X-Client-Signature'], queryExpected, 'The query string is signed as sent');
});

test('a missing table or no database leaves requests unsigned', async () => {
  clearProviderClientCache();
  const broken = { PROVIDER_CREDENTIAL_KEY: 'k', LURI_MUSIC_DB: { prepare() { throw new Error('no such table'); } } };
  assert.equal(await clientSignatureHeaders(broken, new URL('https://togame.cc.cd/v1/catalog/random')), null);
  assert.equal(await clientSignatureHeaders(null, new URL('https://togame.cc.cd/v1/catalog/random')), null);
});

test('admins save keys with the secret encrypted and a clear error for bad input', async () => {
  const db = fakeDatabase([]);
  const env = { PROVIDER_CREDENTIAL_KEY: 'credential-key', LURI_MUSIC_DB: db };
  const post = (data) => new Request('https://zhiyin.us.ci/api/admin/provider-clients', { method: 'POST', body: JSON.stringify(data) });
  const body = (request) => request.json();
  const saved = await handleProviderClientAdmin(post({ providerOrigin: 'https://togame.cc.cd/', clientKey: 'zhiyin', secret: SECRET }), env, 'admin/provider-clients', body);
  assert.equal(saved.status, 200);
  const insert = db.writes.find((item) => item.sql.startsWith('INSERT INTO luri_music_provider_clients'));
  assert.equal(insert.values[1], 'https://togame.cc.cd', 'The address is stored as its origin');
  assert.ok(!insert.values.includes(SECRET), 'The secret is never stored in plain text');
  assert.equal(insert.values[5], SECRET.slice(-4));
  const short = await handleProviderClientAdmin(post({ providerOrigin: 'https://togame.cc.cd', clientKey: 'zhiyin', secret: 'short' }), env, 'admin/provider-clients', body);
  assert.match((await short.json()).error, /32-256/);
  const http = await handleProviderClientAdmin(post({ providerOrigin: 'http://togame.cc.cd', clientKey: 'zhiyin', secret: SECRET }), env, 'admin/provider-clients', body);
  assert.match((await http.json()).error, /HTTPS/);
});

test('the key management endpoints need an admin session', async () => {
  for (const action of ['admin/provider-clients', 'admin/provider-client-secret', 'admin/provider-client-delete']) {
    const response = await handleLuriMusic(new Request(`https://zhiyin.us.ci/api/${action}`, { method: 'POST', body: '{}' }), { LURI_MUSIC_DB: fakeDatabase([]) });
    assert.equal(response.status, 401, action);
  }
});

test('providerFetch signs, the admin page manages keys, and the service end date comes from account', () => {
  const providers = readFileSync(new URL('../functions/luri-music/providers.js', import.meta.url), 'utf8');
  assert.match(providers, /const signature = await clientSignatureHeaders\(signingEnv, target, options\.method \|\| 'GET', options\.body\)\.catch\(\(\) => null\);/);
  assert.match(providers, /account: cleanAccount\(authorization\.account\)/, 'authenticate reports the service state');
  assert.match(providers, /if \(env && expiresAt && expiresAt !== config\.cached_expires_at\)/, 'The end date is stored only when it changes');
  assert.doesNotMatch(providers, /有效\|到期\|过期/, 'presentation is never parsed for dates');
  const admin = readFileSync(new URL('../src/luri-music/Admin.jsx', import.meta.url), 'utf8');
  assert.match(admin, /\['providers', 'key', 'Provider 接入'\]/);
  assert.match(admin, /function ProviderClients\(\{ notify \}\)/);
});
