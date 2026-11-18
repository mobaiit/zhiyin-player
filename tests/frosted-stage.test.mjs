import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/brand-theme.css', import.meta.url), 'utf8');
const assets = new URL('../dist/assets/', import.meta.url);
const cssFiles = readdirSync(assets).filter((file) => file.endsWith('.css'));
const index = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const entryCss = index.match(/href="\/assets\/([^"]+\.css)"/)?.[1];
assert.ok(entryCss && cssFiles.includes(entryCss), 'Run npm run build before this production-CSS regression check');
const built = readFileSync(new URL(entryCss, assets), 'utf8');
// Inspect declarations in the actual minified artifact, not just the source.
const rules = [...built.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector, body }));

test('every product surface shares one transparent, unblurred page layer', () => {
  const layer = rules.find(({ selector }) => ['.luri-music-clone .music-page:before', '.docs-page:before', '.admin-page:before', '.admin-login:before', '.ui-loading:before']
    .every((part) => selector.includes(part)));
  assert.ok(layer, 'All product surfaces must share the same page layer');
  // The former page-wide blur made every route soft and expensive.
  for (const property of ['backdrop-filter', '-webkit-backdrop-filter']) {
    assert.match(layer.body, new RegExp(`(?:^|;)${property}:none!important`));
  }
  assert.match(layer.body, /background:(?:transparent|#0000|0 0)!important/);
  assert.match(layer.body, /position:fixed!important/);
  assert.match(layer.body, /inset:0!important/);
  assert.match(layer.body, /pointer-events:none/);
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
  assert.ok(rules.some(({ selector, body }) => selector.includes('.ui-loading:before') && /background:(?:transparent|#0000|0 0)!important/.test(body)), 'Loading must not flash an unrelated background');
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

test('transparent blur theme reuses the existing artwork element', () => {
  assert.doesNotMatch(source, /music-artwork-backdrop::after|--(?:zy|admin)-stage-/);
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop' && body.includes('filter:none!important')));
  const glassArtwork = rules.find(({ selector, body }) => selector === 'html[data-theme=glass] .luri-music-clone .music-artwork-backdrop' && body.includes('blur(38px)'));
  assert.ok(glassArtwork, 'Only the transparent blur theme should process the existing artwork backdrop');
  assert.match(glassArtwork.body, /saturate\(1\.22\)/);
  assert.match(glassArtwork.body, /brightness\(\.58\)/);
  const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
  assert.equal((music.match(/className=\{`music-artwork-backdrop/g) || []).length, 1);
});

test('white, black and transparent blur themes use one shared semantic surface system', () => {
  assert.ok(rules.some(({ selector, body }) => selector === '.luri-music-clone .music-artwork-backdrop.is-visible' && /(?:^|;)opacity:1(?:;|$)/.test(body)));
  for (const rule of rules.filter(({ selector }) => selector === '.luri-music-clone .music-artwork-backdrop')) {
    assert.doesNotMatch(rule.body, /transition:/, 'Artwork and glass must switch atomically to avoid unreadable intermediate tones');
  }
  for (const theme of ['light', 'dark', 'glass']) {
    const palette = rules.find(({ selector, body }) => selector === `html[data-theme=${theme}]` && body.includes('--zy-theme-surface:'));
    assert.ok(palette, `${theme} palette must define the shared surface tokens`);
    for (const token of ['--zy-theme-canvas:', '--zy-theme-surface:', '--zy-theme-surface-raised:', '--zy-theme-border:', '--zy-theme-text:', '--zy-theme-muted:']) assert.match(palette.body, new RegExp(token));
  }
  const bridge = rules.find(({ selector, body }) => selector === '.luri-music-clone' && body.includes('--zy-interface-surface:var(--zy-theme-surface)'));
  assert.ok(bridge, 'Existing pages must consume the new semantic theme tokens');
  const glassSurfaces = rules.find(({ selector, body }) => selector.includes('html[data-theme=glass] :is(') && body.includes('backdrop-filter:blur(18px)'));
  assert.ok(glassSurfaces, 'Blur belongs to explicit glass surfaces, not a full-page veil');
  assert.ok(rules.some(({ selector, body }) => selector.includes('.luri-music-clone .music-page:before') && body.includes('backdrop-filter:none!important')));
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

test('active lyrics and filled favourites use the same vivid red in both themes', () => {
  const light = themeVars('light');
  const dark = themeVars('dark');
  assert.equal(light['--zy-active-red'], '#ff3b30');
  assert.equal(light['--zy-reading-accent'], '#481219', 'Other selected controls retain their existing colour');
  assert.equal(dark['--zy-active-red'], light['--zy-active-red'], 'Both themes inherit one vivid red');
  const [red, green] = rgb(light['--zy-active-red']);
  const [oldRed, oldGreen] = rgb(light['--zy-reading-accent']);
  assert.ok(red - green > (oldRed - oldGreen) * 1.2);
  assert.equal((source.match(/--zy-active-red\s*:/g) || []).length, 1, 'No light-theme override may darken the shared red');
  // The full-screen player owns lyrics and the favourite action.
  const player = readFileSync(new URL('../src/styles/player.css', import.meta.url), 'utf8');
  assert.match(player, /\.music-app-now \{[^}]*--now-lyric-active: var\(--zy-active-red\);/);
  assert.match(player, /\.music-app-now \{[^}]*--now-liked: var\(--zy-active-red\);/);
  assert.equal((player.match(/--now-(?:lyric-active|liked)\s*:/g) || []).length, 2, 'No theme or style may override the shared red');
  assert.match(player, /\.music-app-now \.lyrics-body p\.active \{[^}]*color: var\(--now-lyric-active\);/);
  assert.match(player, /\.music-app-now :is\(\.music-app-now__actions, \.music-app-now__controls\) button\.liked \{ color: var\(--now-liked\); \}/);
  assert.match(player, /\.music-app-now :is\(\.music-app-now__actions, \.music-app-now__controls\) button\.liked \.music-icon \{ fill: currentColor; \}/, 'Filled hearts inherit the selected colour');
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
    // The user explicitly requested one vivid red for lyrics/icons. Keep the
    // ordinary palette gate, but report the accent's known AA tradeoff honestly
    // instead of silently darkening it or claiming full contrast compliance.
    const accent = rgb(vars['--zy-active-red']);
    const selected = vars['--zy-row-selected-surface'].match(/[\d.]+/g).map(Number);
    const interfaceSurface = vars['--zy-shared-interface-surface'].match(/[\d.]+/g).map(Number);
    let worst = { ratio: Infinity };
    let accentWorst = Infinity;
    for (const stop of stops) for (const first of [0, 1]) for (const second of [0, 1]) {
      let base = blend(stop, radials[1], radials[1][3] * second);
      base = blend(base, radials[0], radials[0][3] * first);
      for (const cover of covers) for (const visibility of [0, 1]) {
        const background = frost(visibility ? cover : base, vars, Boolean(visibility));
        for (const state of ['plain', 'selected', 'interface']) for (const [name, color] of foregrounds) {
          const surface = state === 'selected' ? blend(background, selected, selected[3])
            : state === 'interface' ? blend(background, interfaceSurface, interfaceSurface[3]) : background;
          const ratio = contrast(color, surface);
          accentWorst = Math.min(accentWorst, contrast(accent, surface));
          if (ratio < worst.ratio) worst = { ratio, name, cover, visibility, state, background: surface };
        }
      }
    }
    assert.ok(worst.ratio >= 4.5, `${theme} minimum contrast: ${JSON.stringify(worst)}`);
    t.diagnostic(`Worst sampled contrast: ${worst.ratio.toFixed(2)}:1 (${worst.name})`);
    t.diagnostic(`Requested lyric/icon accent minimum contrast: ${accentWorst.toFixed(2)}:1 (below AA on some covers)`);
  });
}
