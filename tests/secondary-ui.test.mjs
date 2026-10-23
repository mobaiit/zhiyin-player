import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { activateOverlayFocus } from '../src/components/useOverlayFocus.js';

test('overlay focus wraps, closes with Escape, unlocks scroll and restores its trigger', () => {
  const previousDocument = globalThis.document;
  const listeners = new Map();
  const doc = { body: { style: { overflow: 'auto' } }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) };
  globalThis.document = doc;
  const node = (visible = true) => ({ isConnected: true, getClientRects: () => visible ? [{}] : [], focus() { doc.activeElement = this; } });
  const trigger = node(); const first = node(); const hidden = node(false); const last = node();
  const panel = { querySelectorAll: () => [first, hidden, last], contains: (target) => [first, hidden, last].includes(target), focus() { doc.activeElement = this; } };
  doc.activeElement = trigger;
  let closed = 0;
  try {
    const cleanup = activateOverlayFocus(panel, () => closed++, trigger);
    assert.equal(doc.body.style.overflow, 'hidden');
    assert.equal(doc.activeElement, first);
    const key = (value, shiftKey = false) => { let prevented = false; listeners.get('keydown')({ key: value, shiftKey, preventDefault() { prevented = true; } }); return prevented; };
    assert.equal(key('Tab', true), true); assert.equal(doc.activeElement, last);
    assert.equal(key('Tab'), true); assert.equal(doc.activeElement, first);
    assert.equal(key('Escape'), true); assert.equal(closed, 1);
    cleanup();
    assert.equal(doc.body.style.overflow, 'auto');
    assert.equal(doc.activeElement, trigger);
    assert.equal(listeners.size, 0);
  } finally { globalThis.document = previousDocument; }
});

test('overlay retains autofocus and safely handles an empty focus boundary', () => {
  const previousDocument = globalThis.document;
  let handler;
  const doc = { body: { style: { overflow: '' } }, addEventListener: (_, value) => { handler = value; }, removeEventListener() {} };
  globalThis.document = doc;
  const input = { getClientRects: () => [{}], focus() { doc.activeElement = this; } };
  const trigger = { isConnected: false, focus() { throw new Error('detached trigger must not be focused'); } };
  const panel = { querySelectorAll: () => [input], contains: (value) => value === input, focus() { doc.activeElement = this; } };
  try {
    doc.activeElement = input;
    const cleanup = activateOverlayFocus(panel, () => {}, trigger);
    assert.equal(doc.activeElement, input);
    panel.querySelectorAll = () => [];
    let prevented = false;
    handler({ key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(doc.activeElement, panel);
    cleanup();
    assert.equal(doc.body.style.overflow, '');
  } finally { globalThis.document = previousDocument; }
});

test('documentation renders all existing sections, semantic schemas and accessible navigation', async () => {
  // ThemeToggle is client-only; shared theme behavior has its own tests.
  const server = await createServer({
    plugins: [{ name: 'docs-test-theme', enforce: 'pre', transform(_code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/components/ThemeToggle.jsx')) return 'export default function ThemeToggle() { return null; }';
    } }],
    server: { middlewareMode: true }, appType: 'custom',
  });
  try {
    const { default: Docs } = await server.ssrLoadModule('/src/pages/Docs.jsx');
    const html = renderToStaticMarkup(createElement(Docs));
    for (const id of ['start', 'connections', 'data', 'troubleshooting', 'protocol', 'discovery', 'authentication', 'track-model', 'catalog', 'resources', 'methods', 'errors', 'security']) assert.ok(html.includes(`id="${id}"`), id);
    assert.match(html, /<thead><tr><th scope="col">参数/);
    assert.match(html, /<th scope="row"><code>/);
    assert.match(html, /aria-controls="docs-navigation"/);
    assert.match(html, /GitHub 项目（新窗口）/);
    assert.match(html, /href="#docs-content"/);
    assert.match(html, /src="\/zhiyin-logo.png"/);
  } finally { await server.close(); }
});

test('secondary pages reuse the stage while preserving admin search and mobile constraints', async () => {
  const css = await readFile(new URL('../src/pages/Docs.css', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../src/luri-music/Admin.jsx', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../src/brand-theme.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /backdrop-filter|::before\s*\{/);
  assert.match(css, /\.docs-search input \{ font-size: 16px;/);
  assert.match(css, /\.docs-sidebar\.open \{ visibility: visible;/);
  assert.match(css, /\.docs-schema table \{ min-width: 620px;/);
  assert.match(admin, /role="search" onSubmit=\{search\}/);
  assert.match(admin, /filters\.query[\s\S]*signal: controller\.signal/);
  assert.match(admin, /requestRef\.current\?\.abort\(\)/);
  assert.match(admin, /function AdminOverlay/);
  assert.match(admin, /createPortal\([\s\S]*document\.querySelector\('\.admin-page'\)/);
  assert.match(theme, /\.user-table \{\s*overflow-x: auto !important/);
});
