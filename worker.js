import { handleLuriMusic } from './functions/luri-music/index.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const { pathname, searchParams } = new URL(request.url);
    if (pathname.startsWith('/api/music/') || pathname.startsWith('/api/luri-music/music/')) {
      return json({ error: 'Music capabilities are provided by the configured Provider' }, 404);
    }
    if (pathname.startsWith('/api/')) {
      try {
        return await handleLuriMusic(request, env);
      } catch (error) {
        console.error('ZY MUSIC API failed', pathname, error?.stack || error);
        return json({ error: `后台服务异常（${pathname.endsWith('/admin/login') ? '登录' : '请求'}未完成），请稍后重试` }, 500);
      }
    }
    if (pathname === '/admin') return Response.redirect(new URL('/?admin=1', request.url), 302);
    if (pathname === '/music' || pathname === '/luri-music') return Response.redirect(new URL('/', request.url), 301);
    if (pathname === '/' && searchParams.get('admin') === '1') return env.ASSETS.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
