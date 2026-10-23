export const THEME_KEY = 'zy.music.theme';
const THEME_EVENT = 'zy:theme-change';
const normalizeTheme = (value) => value === 'light' ? 'light' : 'dark';

export const getTheme = () => normalizeTheme(document.documentElement.dataset.theme);

export function setTheme(value, { persist = true } = {}) {
  const theme = normalizeTheme(value);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Private browsing may disallow storage. */ }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeToTheme(listener) {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

// Owned by App, not a toggle button: login and loading screens also stay in sync.
export function syncThemeAcrossTabs() {
  setTheme(getTheme(), { persist: false });
  const onStorage = (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    setTheme(event.newValue, { persist: false });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
