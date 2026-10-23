import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('title scroll measures overflow, responds to resize/fonts and cleans up on track change', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { observePlayerTitle, default: PlayerTitle } = await server.ssrLoadModule('/src/components/PlayerTitle.jsx');
    const handlers = new Map();
    const fontHandlers = new Map();
    let resolveFonts; let callback; let disconnected = false; let textWidth = 140;
    const observed = [];
    class ResizeObserver {
      constructor(handler) { callback = handler; }
      observe(node) { observed.push(node); }
      disconnect() { disconnected = true; }
    }
    const styles = new Map();
    const title = { clientWidth: 80, dataset: {}, style: { setProperty: (key, value) => styles.set(key, value) } };
    const text = { getBoundingClientRect: () => ({ width: textWidth }) };
    const events = (map) => ({ addEventListener: (key, value) => map.set(key, value), removeEventListener: (key) => map.delete(key) });
    const cleanup = observePlayerTitle(title, text, { ResizeObserver, eventTarget: events(handlers), fonts: {
      ...events(fontHandlers), ready: new Promise((resolve) => { resolveFonts = resolve; }),
    } });
    assert.deepEqual(observed, [title, text]);
    assert.equal(title.dataset.overflow, 'true');
    assert.equal(styles.get('--player-title-offset'), '-60px');
    title.clientWidth = 160; callback();
    assert.equal(title.dataset.overflow, 'false', 'Wide enough titles remain static');
    title.clientWidth = 0; callback();
    assert.equal(title.dataset.overflow, 'false', 'Hidden route has no animation');
    title.clientWidth = 100; handlers.get('resize')();
    assert.equal(styles.get('--player-title-offset'), '-40px');
    textWidth = 400; fontHandlers.get('loadingdone')();
    assert.equal(styles.get('--player-title-offset'), '-300px');
    const duration = parseFloat(styles.get('--player-title-duration'));
    assert.ok(300 / (duration * 0.6) <= 24, 'Long titles stay slow, not a fixed-duration rush');
    cleanup();
    assert.equal(disconnected, true);
    assert.equal(handlers.size + fontHandlers.size, 0);
    textWidth = 600; resolveFonts(); await Promise.resolve();
    assert.equal(styles.get('--player-title-offset'), '-300px', 'Late font promise cannot update unmounted title');
    const html = renderToStaticMarkup(createElement(PlayerTitle, null, '完整歌曲名称'));
    assert.equal((html.match(/完整歌曲名称/g) || []).length, 2, 'Text is not duplicated for screen readers; other copy is the title attribute');
    assert.doesNotMatch(html, /<button/);
  } finally { await server.close(); }
});

test('title motion is mobile-only, pauses at both ends and respects reduced motion', () => {
  const css = readFileSync(new URL('../src/pages/Music.css', import.meta.url), 'utf8');
  assert.match(css, /0%, 20% \{ transform: translateX\(0\); \}/);
  assert.match(css, /80%, 100% \{ transform: translateX\(var\(--player-title-offset\)\); \}/);
  assert.match(css, /@media \(max-width: 760px\) and \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/);
  assert.match(css, /\.music-player__title\[data-overflow="true"\]\s*\{\s*text-overflow: clip;/);
  assert.match(css, /@media \(max-width: 760px\) and \(prefers-reduced-motion: reduce\)[\s\S]*?text-overflow: ellipsis;/);
  assert.match(css, /@media \(max-width: 760px\) and \(hover: hover\)[\s\S]*?animation-play-state: paused;/);
  assert.doesNotMatch(css, /\.music-player:focus-within \.music-player__title-text/);
});
