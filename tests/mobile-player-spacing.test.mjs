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

test('mobile title keeps its full width with more comfortable horizontal spacing', () => {
  assert.equal(lastValue(music, '.music-player__title', 'max-width'), '100%');
  assert.equal(lastValue(music, `${scoped} .music-player`, 'padding-inline'), '6px');
  assert.equal(lastValue(music, `${scoped} .music-player`, 'column-gap'), '6px');
  assert.equal(lastValue(music, `${scoped} .music-player__song`, 'gap'), '6px');
  assert.equal(lastValue(music, `${scoped} .music-controls`, 'gap'), '4px');
  assert.equal(lastValue(music, `${scoped} .music-player .music-quality`, 'margin-right'), '0');
  assert.equal(lastValue(brand, `${scoped} .music-player`, 'width'), 'calc(100% - 16px)');
});

test('spacing budget improves at phone widths without smaller buttons or hidden controls', () => {
  // Arithmetic regression, not browser/font measurement. Normal 16px root;
  // Reserve a conservative 48px for Hi-Res. Animated titles clip instead of
  // reserving ellipsis space, so four Chinese glyphs require 4em.
  const padding = parseFloat(lastValue(music, `${scoped} .music-player`, 'padding-inline'));
  const columnGap = parseFloat(lastValue(music, `${scoped} .music-player`, 'column-gap'));
  const songGap = parseFloat(lastValue(music, `${scoped} .music-player__song`, 'gap'));
  const controlGap = parseFloat(lastValue(music, `${scoped} .music-controls`, 'gap'));
  for (const width of [320, 360, 375, 390, 414, 760]) {
    const compact = width <= 390;
    const button = compact ? 34 : 36;
    // The image retains its original 36px flex-basis even on compact screens.
    const cover = 36;
    const lyricsColumn = compact ? 32 : 36;
    for (const view of ['playlist', 'hires', 'now']) {
      const slot = view === 'now' ? button : view === 'hires' ? 48 : 1.45 * 16;
      const fixed = 3 * button + 2.2 * 16 + slot + cover + lyricsColumn + 2;
      const available = width - 16 - 2 * padding - 2 * columnGap - songGap - 4 * controlGap - fixed;
      const oldAvailable = width - 24 - 2 * 16 - 2 * (compact ? 5 : 8)
        - 8 - 4 * 0.3 * 16 - (view === 'playlist' ? 0.2 * 16 : 0) - fixed - 2 * 16;
      assert.ok(available > 0, `${width}/${view}: no horizontal overflow in the budget`);
      assert.ok(available - oldAvailable >= 50, `${width}/${view}: retain useful title space`);
      if (width >= (view === 'hires' ? 375 : 360)) assert.ok(available >= 4 * 14, `${width}/${view}: four visible glyphs`);
    }
  }
  const transport = `${scoped} .music-player .music-controls .music-icon-button,\n  ${scoped} .music-player .music-controls .play-button`;
  assert.equal(lastValue(music, transport, 'width'), '34px');
  assert.equal(lastValue(music, transport, 'height'), '34px');
  assert.match(music, /\.mobile-view-now \.music-playback-mode\s*\{\s*display: inline-grid !important/);
  assert.match(music, /\.mobile-view-playlist \.music-playback-mode\s*\{\s*display: none !important/);
});
