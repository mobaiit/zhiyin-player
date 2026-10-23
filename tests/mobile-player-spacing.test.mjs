import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const music = readFileSync(new URL('../src/pages/Music.css', import.meta.url), 'utf8');
const brand = readFileSync(new URL('../src/brand-theme.css', import.meta.url), 'utf8');
const blocks = (source, selector) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => selectors.replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector).map(([, , body]) => body);
const lastValue = (source, selector, property) => blocks(source, selector)
  .flatMap((body) => [...body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, 'g'))])
  .at(-1)?.[1].replace(/\s*!important$/, '').trim();
const scoped = 'body:not(.has-global-music-player)';

test('mobile title reuses the old badge reservation and only horizontal spacing is tightened', () => {
  assert.equal(lastValue(music, '.music-player__title', 'max-width'), '100%');
  assert.equal(lastValue(music, `${scoped} .music-player`, 'padding-inline'), '4px');
  assert.equal(lastValue(music, `${scoped} .music-player`, 'column-gap'), '4px');
  assert.equal(lastValue(music, `${scoped} .music-player__song`, 'gap'), '4px');
  assert.equal(lastValue(music, `${scoped} .music-controls`, 'gap'), '2px');
  assert.equal(lastValue(music, `${scoped} .music-player .music-quality`, 'margin-right'), '0');
  assert.equal(lastValue(brand, `${scoped} .music-player`, 'width'), 'calc(100% - 16px)');
});

test('spacing budget improves at phone widths without smaller buttons or hidden controls', () => {
  // Arithmetic regression, not browser/font measurement. Normal 16px root;
  // reserve a conservative 48px for Hi-Res, and 5em for four glyphs + ellipsis.
  for (const width of [320, 360, 375, 390, 414, 760]) {
    const compact = width <= 390;
    const button = compact ? 34 : 36;
    const cover = compact ? 32 : 36;
    const lyricsColumn = compact ? 32 : 36;
    for (const view of ['playlist', 'now']) {
      const slot = view === 'now' ? button : 48;
      const fixed = 3 * button + 2.2 * 16 + slot + cover + lyricsColumn + 2;
      const available = width - 16 - 2 * 4 - 2 * 4 - 4 - 4 * 2 - fixed;
      const oldAvailable = width - 24 - 2 * 16 - 2 * (compact ? 5 : 8)
        - 8 - 4 * 0.3 * 16 - (view === 'playlist' ? 0.2 * 16 : 0) - fixed - 2 * 16;
      assert.ok(available > 0, `${width}/${view}: no horizontal overflow in the budget`);
      assert.ok(available - oldAvailable >= 70, `${width}/${view}: reclaim wasted title space`);
      if (width >= 375) assert.ok(available >= 5 * 14, `${width}/${view}: four glyphs plus ellipsis`);
    }
  }
  const transport = `${scoped} .music-player .music-controls .music-icon-button,\n  ${scoped} .music-player .music-controls .play-button`;
  assert.equal(lastValue(music, transport, 'width'), '34px');
  assert.equal(lastValue(music, transport, 'height'), '34px');
  assert.match(music, /\.mobile-view-now \.music-playback-mode\s*\{\s*display: inline-grid !important/);
  assert.match(music, /\.mobile-view-playlist \.music-playback-mode\s*\{\s*display: none !important/);
});
