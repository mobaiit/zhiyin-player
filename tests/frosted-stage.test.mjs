import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/brand-theme.css', import.meta.url), 'utf8');
const assets = new URL('../dist/assets/', import.meta.url);
const cssFiles = readdirSync(assets).filter((file) => file.endsWith('.css'));
assert.equal(cssFiles.length, 1, 'Run npm run build before this production-CSS regression check');
const built = readFileSync(new URL(cssFiles[0], assets), 'utf8');
// Inspect declarations in the actual minified artifact, not just the source.
const rules = [...built.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector, body }));

test('production veil retains BOTH standard and WebKit backdrop filters', () => {
  const veil = rules.find(({ selector, body }) =>
    selector.includes('.luri-music-clone .music-page:before') &&
    selector.includes('.docs-page:before') &&
    selector.includes('.admin-page:before') &&
    selector.includes('.admin-login:before') &&
    body.includes('--zy-shared-glass-tint'));
  assert.ok(veil, 'All product surfaces must share the frosted veil');
  for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
    assert.ok(veil.body.includes(`${property}:blur(var(--zy-shared-stage-blur)) saturate(var(--zy-shared-stage-saturate)) brightness(var(--zy-shared-stage-brightness))!important`));
  }
  assert.match(veil.body, /position:fixed!important/);
  assert.match(veil.body, /inset:0!important/);
  assert.match(veil.body, /pointer-events:none/);
});

test('light and dark share exactly the requested frosting parameters', () => {
  for (const [name, value] of [['blur', '20px'], ['saturate', '1.8'], ['brightness', '1.05']]) {
    const declarations = [...built.matchAll(new RegExp(`--zy-shared-stage-${name}:([^;}]+)`, 'g'))];
    assert.equal(declarations.length, 1, `${name} must not be overridden by old light-theme rules`);
    assert.equal(declarations[0][1], value);
  }
  assert.match(source, /--zy-shared-glass-tint: rgba\(255, 255, 255, 0\.12\)/);
  assert.doesNotMatch(source, /html\[data-theme="light"\] \.music-page::before\s*\{/);
});

test('artwork and veil cover the viewport underneath the transparent player UI', () => {
  const artwork = rules.find(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop' && body.includes('position:fixed'));
  assert.ok(artwork);
  assert.match(artwork.body, /z-index:-2/);
  assert.match(artwork.body, /inset:-40px/);
  const main = rules.find(({ selector, body }) => selector === '.luri-music-clone .music-page' && body.includes('isolation:auto'));
  assert.ok(main, 'The main panel must not trap the full-page background in its own stacking context');
  assert.match(main.body, /background:(?:transparent|#0000|0 0)!important/);
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone' && body.includes('isolation:isolate') && body.includes('background:var(--zy-shared-stage-background)!important')));
});

test('transparent foreground resets also retain their standard property', () => {
  const resets = rules.filter(({ body }) => body.includes('-webkit-backdrop-filter:none!important'));
  assert.ok(resets.length > 0);
  for (const rule of resets) {
    assert.match(rule.body, /(?:^|;)backdrop-filter:none!important(?:;|$)/, rule.selector);
  }
});

test('every route inherits the same global default canvas in both themes', () => {
  const canvases = rules.filter(({ body }) => body.includes('--zy-shared-stage-background:'));
  assert.equal(canvases.length, 2, 'Only the global dark and light palettes may define a default canvas');
  assert.equal(canvases[0].selector, ':root');
  assert.equal(canvases[1].selector, 'html[data-theme=light]');
  for (const page of ['html', 'body', '.luri-music-clone', '.docs-page', '.admin-page', '.admin-login', '.ui-loading']) {
    assert.ok(rules.some(({ selector, body }) => selector.split(',').includes(page) && body.includes('background:var(--zy-shared-stage-background)!important')), page);
  }
  assert.ok(rules.some(({ selector, body }) => selector.includes('.ui-loading:before') && body.includes('--zy-shared-glass-tint')), 'Loading must not flash an unrelated background');
});

test('login has no theme switch, while the authenticated admin header retains one', () => {
  const admin = readFileSync(new URL('../src/luri-music/Admin.jsx', import.meta.url), 'utf8');
  const login = admin.slice(admin.indexOf('function AdminLogin('), admin.indexOf('function Users('));
  assert.doesNotMatch(login, /<ThemeToggle\b/);
  assert.match(admin, /className="admin-header-actions"><ThemeToggle/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /useEffect\(syncThemeAcrossTabs, \[\]\)/, 'Theme sync must not depend on rendering a toggle button');
});
