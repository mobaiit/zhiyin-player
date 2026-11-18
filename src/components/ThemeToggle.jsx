import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeToTheme } from './theme';

export default function ThemeToggle({ className = '' }) {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme);
  const cycle = { light: 'dark', dark: 'glass', glass: 'light' };
  const labels = { light: '白色', dark: '黑色', glass: '透明模糊' };
  const nextTheme = cycle[theme] || 'dark';

  return <button className={`theme-toggle ${className}`.trim()} type="button" onClick={() => setTheme(nextTheme)} aria-label={`切换为${labels[nextTheme]}主题`} title={`当前为${labels[theme]}主题，点击切换为${labels[nextTheme]}主题`}>{theme === 'light' ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg> : theme === 'glass' ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M8 9h8M8 13h5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" /></svg>}</button>;
}
