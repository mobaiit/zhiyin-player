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
  for (const [name, value] of [['blur', '10px'], ['saturate', '1.1'], ['brightness', '0.98']]) {
    const declarations = [...built.matchAll(new RegExp(`--zy-shared-stage-${name}:([^;}]+)`, 'g'))];
    assert.equal(declarations.length, 1, `${name} must not be overridden by old light-theme rules`);
    if (name === 'blur') assert.equal(declarations[0][1], value);
    else assert.equal(Number(declarations[0][1]), Number(value));
  }
  assert.match(source, /--zy-shared-glass-tint: rgba\(255, 255, 255, 0\)/);
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

test('all shared toasts omit countdown bars but retain dismiss behavior', () => {
  const feedback = readFileSync(new URL('../src/luri-music/UiFeedback.jsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/luri-music/ui-feedback.css', import.meta.url), 'utf8');
  for (const content of [feedback, styles, built]) {
    assert.doesNotMatch(content, /ui-toast__progress|ui-toast-progress|--ui-toast-duration/);
  }
  assert.match(feedback, /setTimeout\(\(\) => closeRef\.current\(\), duration\)/);
  assert.match(feedback, /onClick=\{onClose\} aria-label="关闭通知"/);
});

test('background normalization reuses the existing image and single frosted layer', () => {
  assert.equal((source.match(/\.luri-music-clone \.music-artwork-backdrop\s*\{/g) || []).length, 1);
  assert.doesNotMatch(source, /music-artwork-backdrop::after|--(?:zy|admin)-stage-/);
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop' && body.includes('filter:saturate(var(--zy-artwork-saturate)) contrast(var(--zy-artwork-contrast)) brightness(var(--zy-artwork-brightness))!important')));
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  assert.equal((music.match(/className=\{`music-artwork-backdrop/g) || []).length, 1);
});

// Model sRGB compositing and CSS colour filters against the real CSS tokens.
// This is a contrast regression test, not a substitute for browser visual QA.
const clampChannel = (n) => Math.max(0, Math.min(255, n));
const rgb = (hex) => hex.slice(1).match(/../g).map((n) => parseInt(n, 16));
const blend = (under, over, alpha) => under.map((n, i) => n * (1 - alpha) + over[i] * alpha);
const saturate = (color, s) => {
  const luma = color.reduce((sum, n, i) => sum + n * [0.213, 0.715, 0.072][i], 0);
  return color.map((n) => clampChannel(luma + (n - luma) * s));
};
const luminance = (color) => color.reduce((sum, n, i) => {
  const v = n / 255;
  return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
}, 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

for (const theme of ['dark', 'light']) {
  test(`${theme}: primary and secondary text remain readable across extreme cover colours`, (t) => {
    const vars = {};
    const tokenRules = [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector.trim().replaceAll('"', ''), body }));
    const readVars = (selector) => tokenRules.filter((r) => r.selector === selector).forEach(({ body }) => {
      for (const [, key, value] of body.matchAll(/(--[\w-]+):([^;}]+)/g)) vars[key] = value.trim();
    });
    readVars(':root');
    if (theme === 'light') readVars('html[data-theme=light]');
    const number = (name) => Number(vars[`--zy-${name}`]);
    const stage = vars['--zy-shared-stage-background'];
    const stops = [...stage.matchAll(/#[\da-f]{6}\b/gi)].map(([hex]) => rgb(hex));
    const radials = [...stage.matchAll(/rgba\(([^)]+)\)/g)].map(([, channels]) => channels.split(',').map(Number));
    const covers = [];
    for (const r of [0, 64, 128, 192, 255]) for (const g of [0, 64, 128, 192, 255]) for (const b of [0, 64, 128, 192, 255]) covers.push([r, g, b]);
    const foregrounds = ['text', 'text-secondary', 'muted', 'reading-accent'].map((name) => [name, rgb(vars[`--zy-${name}`])]);
    const selected = vars['--zy-row-selected-surface'].match(/[\d.]+/g).map(Number);
    let worst = { ratio: Infinity };
    for (const stop of stops) for (const first of [0, 1]) for (const second of [0, 1]) {
      let base = blend(stop, radials[1], radials[1][3] * second);
      base = blend(base, radials[0], radials[0][3] * first);
      for (const cover of covers) for (const visibility of [0, 0.5, 1]) {
        const normalized = saturate(cover, number('artwork-saturate')).map((n) =>
          clampChannel((n * number('artwork-contrast') + 127.5 * (1 - number('artwork-contrast'))) * number('artwork-brightness')));
        const composite = blend(base, normalized, number('artwork-opacity') * visibility);
        const background = saturate(composite, number('shared-stage-saturate')).map((n) => clampChannel(n * number('shared-stage-brightness')));
        for (const state of ['plain', 'selected']) for (const [name, color] of foregrounds) {
          const surface = state === 'selected' ? blend(background, selected, selected[3]) : background;
          const ratio = contrast(color, surface);
          if (ratio < worst.ratio) worst = { ratio, name, cover, visibility, state, background: surface };
        }
      }
    }
    assert.ok(worst.ratio >= 4.5, `${theme} minimum contrast: ${JSON.stringify(worst)}`);
    t.diagnostic(`Worst sampled contrast: ${worst.ratio.toFixed(2)}:1 (${worst.name})`);
  });
}
