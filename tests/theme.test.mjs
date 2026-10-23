import assert from 'node:assert/strict';
import test from 'node:test';
import { getTheme, setTheme, subscribeToTheme, syncThemeAcrossTabs, THEME_KEY } from '../src/components/theme.js';

test('shared theme works without a login-page toggle', async (t) => {
  const originals = Object.fromEntries(['window', 'document', 'localStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const stored = new Map();
  globalThis.window = new EventTarget();
  globalThis.document = { documentElement: { dataset: { theme: 'light' }, style: {} } };
  globalThis.localStorage = { setItem: (key, value) => stored.set(key, value) };
  const storageEvent = (key, newValue) => {
    const event = new Event('storage');
    Object.assign(event, { key, newValue });
    window.dispatchEvent(event);
  };
  const cleanup = syncThemeAcrossTabs();
  t.after(() => {
    cleanup();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  await t.test('initialization preserves the theme restored by the HTML head', () => {
    assert.equal(getTheme(), 'light');
    assert.equal(document.documentElement.style.colorScheme, 'light');
    assert.equal(stored.size, 0);
  });

  await t.test('a toggle persists and notifies all same-tab subscribers', () => {
    let first = 0;
    let second = 0;
    const unsubscribeFirst = subscribeToTheme(() => first++);
    const unsubscribeSecond = subscribeToTheme(() => second++);
    setTheme('dark');
    assert.equal(getTheme(), 'dark');
    assert.equal(stored.get(THEME_KEY), 'dark');
    assert.equal(first, 1);
    assert.equal(second, 1);
    unsubscribeFirst();
    unsubscribeSecond();
  });

  await t.test('storage sync updates a screen with no toggle and does not write back', () => {
    storageEvent(THEME_KEY, 'light');
    assert.equal(getTheme(), 'light');
    assert.equal(document.documentElement.style.colorScheme, 'light');
    assert.equal(stored.get(THEME_KEY), 'dark');
    storageEvent('unrelated-setting', 'dark');
    assert.equal(getTheme(), 'light');
  });

  await t.test('removing or clearing the preference restores the shared dark default', () => {
    storageEvent(THEME_KEY, null);
    assert.equal(getTheme(), 'dark');
    setTheme('light', { persist: false });
    storageEvent(null, null);
    assert.equal(getTheme(), 'dark');
  });

  await t.test('switching remains usable when local storage is blocked', () => {
    localStorage.setItem = () => { throw new Error('Storage disabled'); };
    assert.doesNotThrow(() => setTheme('light'));
    assert.equal(getTheme(), 'light');
  });

  await t.test('cleanup removes the cross-tab listener', () => {
    cleanup();
    storageEvent(THEME_KEY, 'dark');
    assert.equal(getTheme(), 'light');
  });
});
