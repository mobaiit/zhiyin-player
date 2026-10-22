import { useEffect } from 'react';
import LuriMusic from './luri-music/LuriMusic';
import Admin from './luri-music/Admin';
import Docs from './pages/Docs';
import './luri-music/page-titles.css';
import './brand-theme.css';

export default function App() {
  const { pathname, search } = window.location;
  const isAdmin = pathname === '/admin' || new URLSearchParams(search).get('admin') === '1';

  useEffect(() => {
    document.title = isAdmin ? 'ZY MUSIC ADMIN' : pathname === '/docs' ? 'ZY MUSIC 文档' : 'ZY MUSIC';
  }, [isAdmin, pathname]);

  if (isAdmin) return <Admin />;
  if (pathname === '/docs') return <Docs />;
  return <LuriMusic active standalone docsEnabled />;
}
