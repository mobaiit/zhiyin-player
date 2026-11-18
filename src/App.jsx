import { lazy, Suspense, useEffect } from 'react';
import LuriMusic from './luri-music/LuriMusic';
import { syncThemeAcrossTabs } from './components/theme';
import './brand-theme.css';
// Bottom player and full-screen player. Loaded last: it is the single layout authority.
import './styles/player.css';

const Admin = lazy(() => import('./luri-music/Admin'));
const Docs = lazy(() => import('./pages/Docs'));

const MUSIC_ROUTES = new Set(['/', '/charts', '/search', '/favorites', '/playlists', '/history', '/local', '/settings']);
const isMusicRoute = (pathname) => MUSIC_ROUTES.has(pathname) || /^\/playlists\/[^/]+$/.test(pathname);

export default function App() {
  useEffect(syncThemeAcrossTabs, []);
  let { pathname } = window.location; const { search } = window.location;
  if (pathname !== '/admin' && pathname !== '/docs' && !isMusicRoute(pathname)) {
    window.history.replaceState(null, '', '/'); pathname = '/';
  }
  const isAdmin = pathname === '/admin' || new URLSearchParams(search).get('admin') === '1';

  useEffect(() => {
    document.title = isAdmin ? '知音后台' : pathname === '/docs' ? '知音文档' : '知音';
  }, [isAdmin, pathname]);

  if (isAdmin) return <Suspense fallback={<RouteLoading />}><Admin /></Suspense>;
  if (pathname === '/docs') return <Suspense fallback={<RouteLoading />}><Docs /></Suspense>;
  return <LuriMusic active standalone docsEnabled />;
}

function RouteLoading() {
  return <main className="app-route-loading" role="status" aria-live="polite">正在加载…</main>;
}
