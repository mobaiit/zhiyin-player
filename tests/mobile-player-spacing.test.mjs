import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const player = readFileSync(new URL('../src/styles/player.css', import.meta.url), 'utf8');
const phone = player.slice(player.indexOf('/* Mini player above the phone navigation. */'), player.indexOf('@media (max-width: 700px) and (hover: hover)'));
const block = (selector) => phone.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] || '';
const px = (body, property) => parseFloat(body.match(new RegExp(`(?:^|\\s)${property}: ([\\d.]+)px`))?.[1]);

test('mini player keeps 44px hit areas, an unclipped card and the title column first', () => {
  const card = block('.music-app-player');
  assert.match(card, /position: absolute;/);
  assert.match(card, /right: 8px;/);
  assert.match(card, /left: 8px;/);
  assert.match(card, /width: auto;/, 'Both insets must stay inside the viewport');
  assert.match(card, /grid-template-columns: minmax\(0, 1fr\) auto 44px;/);
  for (const selector of ['.music-app-player .music-controls .music-icon-button', '.music-app-player .music-player__utilities .music-player__mode']) {
    assert.equal(px(block(selector), 'width'), 44, selector);
    assert.equal(px(block(selector), 'height'), 44, selector);
  }
  assert.match(phone, /\.music-app-player \.music-player__utilities :is\(\.music-volume, \.music-download-button, \.music-player__lyrics-button\) \{ display: none; \}/, 'Copying the URL lives in the full-screen player');
});

test('spacing budget leaves room for a short title and a Hi-Res badge at phone widths', () => {
  // Arithmetic regression, not browser measurement: card inset, padding, border,
  // two column gaps, artwork and its gap, two transport buttons and one utility.
  const card = block('.music-app-player');
  const padding = parseFloat(card.match(/padding: [\d.]+px ([\d.]+)px/)[1]);
  const columnGap = px(card, 'column-gap');
  const songGap = px(block('.music-app-player .music-player__song'), 'gap');
  const cover = px(block('.music-app-player .music-player__song img'), 'width');
  const timeWidth = px(block('.music-app-player .music-player__time'), 'min-width');
  const timeGap = px(block('.music-app-player .music-player__time'), 'margin-right');
  for (const width of [320, 360, 375, 390, 414]) {
    const timeSpace = width < 360 ? 0 : timeWidth + timeGap;
    const available = width - 16 - 2 * padding - 2 - 2 * columnGap - cover - songGap - 2 * 44 - 44 - timeSpace;
    assert.ok(available >= 4 * 12 + 48, `${width}: four glyphs and a Hi-Res badge fit (${available}px)`);
  }
});
