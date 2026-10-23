import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { handleLuriMusic } from '../functions/luri-music/index.js';

async function fakeBrowser(run) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const scripts = [];
  const timers = new Map();
  let timerId = 0;
  globalThis.window = { setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  globalThis.document = {
    querySelector: () => scripts.find((script) => !script.removed) || null,
    createElement: () => {
      const listeners = new Map();
      return { dataset: {}, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), remove() { this.removed = true; }, fire: (name) => listeners.get(name)?.(), listeners };
    },
    head: { appendChild: (script) => scripts.push(script) },
  };
  try {
    const { loadTurnstile } = await import(`../src/luri-music/turnstile-loader.js?test=${timerId}-${Math.random()}`);
    await run({ loadTurnstile, scripts, timers });
  } finally { globalThis.window = originalWindow; globalThis.document = originalDocument; }
}

test('Turnstile shares a script, resolves only when the API is ready and cleans up listeners', () => fakeBrowser(async ({ loadTurnstile, scripts, timers }) => {
  const first = loadTurnstile();
  assert.equal(first, loadTurnstile());
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /^https:\/\/challenges.cloudflare.com\/turnstile/);
  const api = { render() {} };
  window.turnstile = api;
  scripts[0].fire('load');
  assert.equal(await first, api);
  assert.equal(await loadTurnstile(), api);
  assert.equal(timers.size, 0);
  assert.equal(scripts[0].listeners.size, 0);
}));

for (const failure of ['error', 'timeout', 'missing-api']) {
  test(`Turnstile ${failure} permits a clean retry`, () => fakeBrowser(async ({ loadTurnstile, scripts, timers }) => {
    const pending = loadTurnstile();
    const rejected = assert.rejects(pending, /人机验证加载失败/);
    if (failure === 'timeout') [...timers.values()][0]();
    else scripts[0].fire(failure === 'missing-api' ? 'load' : 'error');
    await rejected;
    assert.equal(scripts[0].removed, true);
    assert.equal(scripts[0].listeners.size, 0);
    assert.equal(timers.size, 0);
    const retry = loadTurnstile();
    assert.equal(scripts.length, 2);
    window.turnstile = { render() {} };
    scripts[1].fire('load');
    assert.equal(await retry, window.turnstile);
  }));
}

test('admin login rejects missing human verification before querying credentials', async () => {
  const env = { TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET_KEY: 'test-secret', LURI_MUSIC_DB: { prepare() { assert.fail('No credential lookup before human verification'); } } };
  const response = await handleLuriMusic(new Request('https://example.test/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'test-user', password: 'not-a-real-password' }) }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, '请先完成人机验证');
  const config = await handleLuriMusic(new Request('https://example.test/api/auth/me'), env);
  assert.deepEqual((await config.json()).turnstile, { enabled: true, siteKey: 'test-site-key' });
});

test('admin login rejects invalid verification through the real server-side check', async () => {
  const originalFetch = globalThis.fetch;
  let checks = 0;
  globalThis.fetch = async (url, options) => {
    checks++;
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(new URLSearchParams(options.body).get('response'), 'test-invalid-token');
    return { ok: true, json: async () => ({ success: false }) };
  };
  try {
    const env = { TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET_KEY: 'test-secret', LURI_MUSIC_DB: { prepare() { assert.fail('Invalid tokens must never reach credential lookup'); } } };
    const response = await handleLuriMusic(new Request('https://example.test/api/admin/login', { method: 'POST', body: JSON.stringify({ turnstileToken: 'test-invalid-token' }) }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, '人机验证未通过');
    assert.equal(checks, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('login shows a persistent widget and cannot silently treat failed config as disabled', async () => {
  const widget = await readFile(new URL('../src/luri-music/Turnstile.jsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../src/luri-music/Admin.jsx', import.meta.url), 'utf8');
  assert.match(widget, /appearance: 'always'/);
  assert.match(widget, /重新加载验证/);
  assert.match(widget, /theme,\s*size: 'flexible'/);
  assert.match(widget, /'timeout-callback': fail/);
  assert.match(admin, /if \(configError\) return notify/);
  assert.match(admin, /Boolean\(configError\) \|\| \(turnstile.enabled && !token\)/);
});
