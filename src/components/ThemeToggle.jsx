import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeToTheme } from './theme';

export default function ThemeToggle({ className = '' }) {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme);
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const nextLabel = theme === 'dark' ? '浅色' : '深色';
  return <button className={`theme-toggle ${className}`.trim()} type="button" onClick={toggle} aria-label={`切换为${nextLabel}主题`} title={`切换为${nextLabel}主题`}>{theme === 'dark' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>}</button>;
}
