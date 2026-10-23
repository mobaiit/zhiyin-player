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
  for (const [name, value] of [['blur', '9px'], ['saturate', '1.1'], ['brightness', '0.98']]) {
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

test('original artwork and theme tone use the existing image and single frosted layer', () => {
  assert.equal((source.match(/\.luri-music-clone \.music-artwork-backdrop\s*\{/g) || []).length, 1);
  assert.doesNotMatch(source, /music-artwork-backdrop::after|--(?:zy|admin)-stage-/);
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop' && body.includes('filter:none!important')));
  assert.doesNotMatch(source, /--zy-artwork-(?:brightness|contrast|saturate|opacity)\b/);
  const active = rules.find(({ selector }) => selector === '.luri-music-clone:has(.music-artwork-backdrop.is-visible)');
  assert.ok(active, 'Glass tint must follow artwork availability, not playback success');
  assert.match(active.body, /--zy-shared-glass-tint:var\(--zy-artwork-glass-tint\)/);
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  assert.equal((music.match(/className=\{`music-artwork-backdrop/g) || []).length, 1);
});

test('one theme-aware glass controls readability without fading or flattening the original cover', () => {
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop.is-visible' && /(?:^|;)opacity:1(?:;|$)/.test(body)));
  for (const rule of rules.filter(({ selector }) => selector === '.luri-music-clone .music-artwork-backdrop')) {
    assert.doesNotMatch(rule.body, /transition:/, 'Artwork and glass must switch atomically to avoid unreadable intermediate tones');
  }
  const surfaces = [...source.matchAll(/--zy-shared-interface-surface:\s*rgba\(([^)]+)\)/g)]
    .map(([, value]) => Number(value.split(',').at(-1)));
  assert.deepEqual(surfaces, [0.18, 0.30]);
  assert.match(built, /--zy-shared-interface-surface:#27282e2e/);
  assert.match(built, /--zy-shared-interface-surface:#eef0f34d/);
  for (const rule of rules.filter(({ selector }) => ['html[data-theme=light] .lm-site-bar', 'html[data-theme=light] .music-player'].includes(selector))) {
    assert.doesNotMatch(rule.body, /(?:^|;)background:/, 'Old higher-specificity light styles must not override the shared navigation/player surface');
  }
  assert.ok(rules.some(({ selector, body }) => selector.includes('.luri-music-clone>.lm-site-bar') && selector.includes('.luri-music-clone .music-player') && body.includes('background:var(--zy-interface-surface)!important')));
  const tints = [...source.matchAll(/--zy-artwork-glass-tint:\s*rgba\(([^)]+)\)/g)]
    .map(([, value]) => value.split(',').map(Number));
  assert.deepEqual(tints, [[26, 27, 33, 0.76], [244, 242, 243, 0.60]]);
  // The more-specific light selector must not keep an old hardcoded tint.
  for (const selector of ['.luri-music-clone', 'html[data-theme=light] .luri-music-clone']) {
    const declarations = rules.filter((rule) => rule.selector === selector && rule.body.includes('--zy-interface-surface:'));
    assert.ok(declarations.length > 0, selector);
    for (const rule of declarations) assert.match(rule.body, /--zy-interface-surface:var\(--zy-shared-interface-surface\)/);
  }
  assert.ok(rules.some(({ body }) => body.includes('--zy-shared-stage-blur:9px')));
  for (const rule of rules.filter(({ selector, body }) => selector.includes('html[data-theme=light]') && body.includes('--admin-interface-surface:'))) {
    assert.match(rule.body, /--admin-interface-surface:var\(--zy-shared-interface-surface\)/);
  }
});

test('mobile admin navigation has one alignment and an opaque themed surface', () => {
  const nav = rules.find(({ selector, body }) => selector.includes('.admin-page>aside nav :is(') && body.includes('grid-template-columns:18px minmax(0,1fr)'));
  assert.ok(nav, 'Links and buttons must share the same icon and text columns');
  assert.match(nav.body, /justify-content:start!important/);
  assert.match(nav.body, /text-align:left/);
  assert.ok(rules.some(({ body }) => body.includes('--admin-navigation-surface:var(--zy-account-dialog-surface)')));
  assert.ok(rules.some(({ selector, body }) => selector === '.admin-page>aside' && body.includes('background:var(--admin-navigation-surface,var(--admin-interface-surface))!important')));
  for (const rule of rules.filter(({ selector }) => selector.includes('html[data-theme=light]') && selector.includes('aside'))) {
    assert.doesNotMatch(rule.body, /background:(?:transparent|#0000|0 0)!important/, 'Old light rules must not override the opaque mobile navigation');
  }
});

// Model sRGB compositing and the single backdrop filter against the real CSS tokens.
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

const themeVars = (theme) => {
  const vars = {};
  const tokenRules = [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim().replaceAll('"', ''), body }));
  for (const selector of theme === 'light' ? [':root', 'html[data-theme=light]'] : [':root']) {
    for (const { body } of tokenRules.filter((rule) => rule.selector === selector)) {
      for (const [, key, value] of body.matchAll(/(--[\w-]+):([^;}]+)/g)) vars[key] = value.trim();
    }
  }
  return vars;
};
const rgba = (value) => value.match(/[\d.]+/g).map(Number);
const frost = (background, vars, artwork = false) => {
  const filtered = saturate(background, Number(vars['--zy-shared-stage-saturate']))
    .map((n) => clampChannel(n * Number(vars['--zy-shared-stage-brightness'])));
  // CSS paints the translucent glass AFTER filtering its backdrop.
  const tint = rgba(vars[artwork ? '--zy-artwork-glass-tint' : '--zy-shared-glass-tint']);
  return blend(filtered, tint, tint[3]);
};

test('light glass restores colour separation and darker shadows compared with the flattened artwork', () => {
  const light = themeVars('light');
  const base = rgb('#e5d3d7');
  const previous = (cover) => {
    const flattened = saturate(cover, 1.08).map((n) => (n * 0.20 + 127.5 * 0.80) * 1.55);
    return frost(blend(base, flattened, 0.8), light);
  };
  const black = [0, 0, 0];
  assert.ok(luminance(frost(black, light, true)) < luminance(previous(black)) * 0.85, 'Dark cover areas must no longer be lifted into pale grey');
  const chroma = (color) => Math.max(...color) - Math.min(...color);
  for (const sample of [[220, 80, 50], [30, 160, 210], [80, 180, 60]]) {
    assert.ok(chroma(frost(sample, light, true)) > chroma(previous(sample)) * 1.4, 'Warm and cool artwork must retain more colour separation');
  }
});

test('glass preserves highlight steps and a shared unmasked default canvas', () => {
  for (const theme of ['light', 'dark']) {
    const vars = themeVars(theme);
    const highlights = [160, 192, 224, 255].map((level) => frost([level, level, level], vars, true)[0]);
    assert.ok(highlights.at(-1) < 250, 'The composed glass should not become a glaring white field');
    for (let i = 1; i < highlights.length; i++) assert.ok(highlights[i] > highlights[i - 1] + 5, 'Bright details must remain distinct');
    assert.equal(vars['--zy-shared-glass-tint'], 'rgba(255, 255, 255, 0)', 'Routes without artwork must keep the shared default gradient');
  }
});

for (const theme of ['dark', 'light']) {
  test(`${theme}: primary and secondary text remain readable across extreme cover colours`, (t) => {
    const vars = themeVars(theme);
    const stage = vars['--zy-shared-stage-background'];
    const stops = [...stage.matchAll(/#[\da-f]{6}\b/gi)].map(([hex]) => rgb(hex));
    const radials = [...stage.matchAll(/rgba\(([^)]+)\)/g)].map(([, channels]) => channels.split(',').map(Number));
    const covers = [];
    for (const r of [0, 64, 128, 192, 255]) for (const g of [0, 64, 128, 192, 255]) for (const b of [0, 64, 128, 192, 255]) covers.push([r, g, b]);
    const foregrounds = ['text', 'text-secondary', 'muted', 'reading-accent'].map((name) => [name, rgb(vars[`--zy-${name}`])]);
    const selected = vars['--zy-row-selected-surface'].match(/[\d.]+/g).map(Number);
    const interfaceSurface = vars['--zy-shared-interface-surface'].match(/[\d.]+/g).map(Number);
    let worst = { ratio: Infinity };
    for (const stop of stops) for (const first of [0, 1]) for (const second of [0, 1]) {
      let base = blend(stop, radials[1], radials[1][3] * second);
      base = blend(base, radials[0], radials[0][3] * first);
      for (const cover of covers) for (const visibility of [0, 1]) {
        const background = frost(visibility ? cover : base, vars, Boolean(visibility));
        for (const state of ['plain', 'selected', 'interface']) for (const [name, color] of foregrounds) {
          const surface = state === 'selected' ? blend(background, selected, selected[3])
            : state === 'interface' ? blend(background, interfaceSurface, interfaceSurface[3]) : background;
          const ratio = contrast(color, surface);
          if (ratio < worst.ratio) worst = { ratio, name, cover, visibility, state, background: surface };
        }
      }
    }
    assert.ok(worst.ratio >= 4.5, `${theme} minimum contrast: ${JSON.stringify(worst)}`);
    t.diagnostic(`Worst sampled contrast: ${worst.ratio.toFixed(2)}:1 (${worst.name})`);
  });
}
