import { useEffect } from 'react';
import LuriMusic from './luri-music/LuriMusic';
import Admin from './luri-music/Admin';
import Docs from './pages/Docs';
import { syncThemeAcrossTabs } from './components/theme';
import './luri-music/page-titles.css';
import './brand-theme.css';

export default function App() {
  useEffect(syncThemeAcrossTabs, []);
  const { pathname, search } = window.location;
  const isAdmin = pathname === '/admin' || new URLSearchParams(search).get('admin') === '1';

  useEffect(() => {
    document.title = isAdmin ? '知音后台' : pathname === '/docs' ? '知音文档' : '知音';
  }, [isAdmin, pathname]);

  if (isAdmin) return <Admin />;
  if (pathname === '/docs') return <Docs />;
  return <LuriMusic active standalone docsEnabled />;
}
