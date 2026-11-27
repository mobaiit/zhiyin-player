import assert from 'node:assert/strict';
import test from 'node:test';
import { singerSuggestionsFor } from '../src/data/singer-search.js';

test('matches singer names in the middle and by pinyin initials', () => {
  assert.ok(singerSuggestionsFor('杰伦').includes('周杰伦'));
  assert.ok(singerSuggestionsFor('zjl').includes('周杰伦'));
  assert.equal(singerSuggestionsFor('ljj')[0], '林俊杰');
});

test('returns a short local suggestion list', () => {
  assert.deepEqual(singerSuggestionsFor(''), []);
  assert.ok(singerSuggestionsFor('张').length <= 8);
  assert.deepEqual(singerSuggestionsFor('绝无此歌手ABC123'), []);
});
