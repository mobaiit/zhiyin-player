import { useEffect, useState } from 'react';

const THEME_KEY = 'zy.music.theme';

const currentTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key !== THEME_KEY) return;
      const next = event.newValue === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      setTheme(next);
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Storage can be unavailable in private browsing. */ }
    setTheme(next);
  };

  const nextLabel = theme === 'dark' ? '浅色' : '深色';
  return <button className={`theme-toggle ${className}`.trim()} type="button" onClick={toggle} aria-label={`切换为${nextLabel}主题`} title={`切换为${nextLabel}主题`}><span className="theme-toggle__icon" aria-hidden="true" /><span>{nextLabel}</span></button>;
}
