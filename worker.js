import { handleLuriMusic } from './functions/luri-music/index.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const staticAsset = async (request, env, pathname) => {
  const response = await env.ASSETS.fetch(request);
  if (!['GET', 'HEAD'].includes(request.method) || !response.ok) return response;
  const headers = new Headers(response.headers);
  if (/^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname)) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  } else if (/\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i.test(pathname)) {
    headers.set('cache-control', 'public, max-age=86400');
  } else {
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

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
        console.error('知音 API failed', pathname, error?.stack || error);
        return json({ error: `后台服务异常（${pathname.endsWith('/admin/login') ? '登录' : '请求'}未完成），请稍后重试` }, 500);
      }
    }
    if (pathname === '/admin') return Response.redirect(new URL('/?admin=1', request.url), 302);
    if (pathname === '/music' || pathname === '/luri-music') return Response.redirect(new URL('/', request.url), 301);
    if (pathname === '/' && searchParams.get('admin') === '1') return staticAsset(request, env, pathname);
    return staticAsset(request, env, pathname);
  },
};
