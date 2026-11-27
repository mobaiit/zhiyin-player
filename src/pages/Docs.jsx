import { useEffect, useRef, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import useOverlayFocus from '../components/useOverlayFocus';
import './Docs.css';

const manifestExample = `{
  "protocol": "music-provider",
  "protocolVersion": "1.0",
  "provider": {
    "id": "example-library",
    "name": "Example Library",
    "homepage": "https://provider.example.com"
  },
  "capabilities": ["search", "random", "charts", "playlists", "lyrics", "artwork", "playback", "qualities"],
  "playback": {
    "mode": "direct",
    "qualities": ["128k", "192k", "320k", "flac", "flac24bit"]
  },
  "clientAuthentication": { "type": "hmac-sha256", "required": false },
  "endpoints": {
    "authenticate": "https://provider.example.com/v1/auth/authenticate",
    "terms": "https://provider.example.com/terms",
    "privacy": "https://provider.example.com/privacy",
    "search": "https://provider.example.com/v1/catalog/search",
    "random": "https://provider.example.com/v1/catalog/random",
    "charts": "https://provider.example.com/v1/catalog/charts",
    "playlists": "https://provider.example.com/v1/catalog/playlists",
    "resolve": "https://provider.example.com/v1/tracks/resolve",
    "lyrics": "https://provider.example.com/v1/tracks/{songId}/lyrics",
    "artwork": "https://provider.example.com/v1/tracks/{songId}/artwork"
  },
  "presentation": {
    "title": "服务状态",
    "badge": { "text": "可用", "tone": "positive" },
    "items": [{ "label": "有效时间", "value": "2027年10月20日" }]
  }
}`;

const connectionExample = `{
  "url": "https://provider.example.com?key=opaque-value",
  "headers": {
    "Authorization": "Bearer opaque-value",
    "X-Provider-Key": "opaque-value"
  },
  "credentials": "omit"
}`;

const authenticateResponse = `{
  "accessToken": "short-lived-token",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "account": {
    "status": "active",
    "expiresAt": "2027-10-20T12:00:00.000Z"
  },
  "presentation": {
    "title": "服务状态",
    "badge": { "text": "可用", "tone": "positive" }
  }
}`;

const signatureExample = `X-Client-Id: zhiyin
X-Client-Timestamp: 1764230400
X-Client-Signature: lowercaseHex(HMAC-SHA256(Secret, 签名内容))

签名内容（四行，以 \\n 连接，末尾没有换行）：
GET
/v1/catalog/search?q=%E6%9E%97&page=1
1764230400
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;

const signatureCode = `const hex = (buffer) => [...new Uint8Array(buffer)]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

async function signedHeaders(method, url, body, clientId, secret) {
  const encoder = new TextEncoder();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const target = new URL(url);
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body || '')));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const content = [method.toUpperCase(), target.pathname + target.search, timestamp, bodyHash].join('\\n');
  const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(content)));
  return { 'X-Client-Id': clientId, 'X-Client-Timestamp': timestamp, 'X-Client-Signature': signature };
}`;

const trackExample = `{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "title": "Track title",
  "artist": "Artist",
  "album": "Album",
  "duration": 238,
  "art": "https://provider.example.com/artwork/track-001",
  "binding": {
    "source": "example",
    "sourceId": "track-001",
    "meta": {},
    "art": "https://provider.example.com/artwork/track-001"
  }
}`;

const resolveRequest = `POST /v1/tracks/resolve
Content-Type: application/json

{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "title": "Track title",
  "artist": "Artist",
  "album": "Album",
  "binding": {
    "source": "example",
    "sourceId": "track-001",
    "meta": {},
    "art": "https://provider.example.com/artwork/track-001"
  },
  "quality": "320k",
  "refresh": "url"
}`;

const resolveResponse = `{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "url": "https://media.example.com/audio/temporary.mp3",
  "binding": {
    "source": "example",
    "sourceId": "track-001",
    "meta": {},
    "art": "https://provider.example.com/artwork/track-001"
  },
  "requestedQuality": "320k",
  "quality": "320k",
  "bitrate": 320,
  "degraded": false,
  "qualityVerified": true,
  "expiresIn": 60,
  "expiresAt": "2026-09-24T12:01:00.000Z"
}`;

const emptyResolveResponse = `{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "url": "",
  "binding": {
    "source": "example",
    "sourceId": "track-001",
    "meta": {},
    "art": ""
  },
  "expiresIn": 0
}`;

const resourceRequestExample = `const context = {
  title: track.title,
  artist: track.artist,
  album: track.album, // 未知时仍传 ""
  binding: JSON.stringify(track.binding)
};

const query = new URLSearchParams(context);
const lyrics = await fetch(
  \`/v1/tracks/\${encodeURIComponent(track.songId)}/lyrics?\${query}\`
);
const artwork = await fetch(
  \`/v1/tracks/\${encodeURIComponent(track.songId)}/artwork?\${query}\`
);`;

const nav = [
  ['start', '快速开始', 'user'],
  ['connections', '连接方式', 'user'],
  ['data', '数据与切换', 'user'],
  ['troubleshooting', '常见问题', 'user'],
  ['protocol', '协议概览', 'developer'],
  ['discovery', '服务发现', 'developer'],
  ['authentication', '认证与连接', 'developer'],
  ['client-signature', '客户端签名', 'developer'],
  ['track-model', 'Track 与 Binding', 'developer'],
  ['catalog', '目录接口', 'developer'],
  ['resources', '单曲接口', 'developer'],
  ['methods', 'HTTP 与跨域', 'developer'],
  ['errors', '错误规范', 'developer'],
  ['security', '安全与合规', 'developer'],
];

function Code({ children }) {
  const [copyState, setCopyState] = useState('');
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(String(children));
      setCopyState('已复制');
    } catch { setCopyState('复制失败，请手动选择'); }
    timer.current = window.setTimeout(() => setCopyState(''), 2400);
  };
  return <div className="docs-code-wrap"><div className="docs-code-toolbar"><span>代码示例</span><button type="button" onClick={copy} aria-live="polite">{copyState || '复制代码'}</button></div><pre className="docs-code" tabIndex={0} aria-label="代码示例"><code>{children}</code></pre></div>;
}

function Endpoint({ method, path, children }) {
  return <article className="docs-endpoint"><header><b className={`method-${method.toLowerCase()}`}>{method}</b><code>{path}</code></header><p>{children}</p></article>;
}

function SchemaTable({ title, rows }) {
  return <div className="docs-schema-wrap">{title && <h4>{title}</h4>}<div className="docs-schema" role="region" aria-label={title || '参数说明'} tabIndex={0}><table><thead><tr><th scope="col">参数</th><th scope="col">类型</th><th scope="col">必填</th><th scope="col">说明</th></tr></thead><tbody>{rows.map(([name, type, required, description]) => <tr key={`${title}:${name}:${required}`}><th scope="row"><code>{name}</code></th><td>{type}</td><td>{required}</td><td>{description}</td></tr>)}</tbody></table></div></div>;
}

function SimpleTable({ rows }) {
  return <div className="docs-table">{rows.map(([name, description]) => <div key={name}><b>{name}</b><span>{description}</span></div>)}</div>;
}

function Icon({ id }) {
  return <svg className="docs-icon" aria-hidden="true"><use href={`/icons.svg#${id}`} /></svg>;
}

export default function Docs() {
  const [activeSection, setActiveSection] = useState('start');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  useOverlayFocus(menuOpen, menuRef, () => setMenuOpen(false), menuButtonRef);
  const filteredNav = nav.filter(([, label]) => !query.trim() || label.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    const sections = nav.map(([id]) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const navLink = ([id, label]) => <a className={activeSection === id ? 'active' : ''} href={`#${id}`} key={id} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setMenuOpen(false)}>{label}</a>;
  return <main className="docs-page">
    <a className="docs-skip-link" href="#docs-content">跳到文档正文</a>
    <header className="docs-hero">
      <button ref={menuButtonRef} className="docs-menu-button" type="button" aria-label={menuOpen ? '关闭文档目录' : '打开文档目录'} aria-controls="docs-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><span /><span /><span /></button>
      <a className="docs-brand" href="/docs" aria-label="知音使用文档首页"><img src="/zhiyin-logo.png" alt="" width="30" height="30" /><span>知音<strong>使用文档</strong></span></a>
      <span className="docs-version">MPP 1.0</span>
      <nav aria-label="文档快捷导航">
        <a href="https://github.com/mobaiit/zhiyin-player" target="_blank" rel="noreferrer" className="docs-github-link" aria-label="GitHub 项目（新窗口）"><Icon id="github-icon" /></a>
        <ThemeToggle />
        <a href="/" className="docs-player-link"><span className="docs-player-desktop">打开</span>播放器<span aria-hidden="true"> ↗</span></a>
      </nav>
    </header>

    <div className="docs-layout">
      {menuOpen && <button type="button" className="docs-menu-backdrop" aria-label="关闭文档目录" onClick={() => setMenuOpen(false)} />}
      <aside ref={menuRef} id="docs-navigation" className={`docs-sidebar${menuOpen ? ' open' : ''}`} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen || undefined} aria-label="文档目录" tabIndex={-1}>
        <button type="button" className="docs-directory-close" onClick={() => setMenuOpen(false)}>关闭目录 <span aria-hidden="true">×</span></button>
        <label className="docs-search"><span>搜索目录</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="查找章节…" /></label>
        <p>播放器用户</p>
        {filteredNav.filter((item) => item[2] === 'user').map(navLink)}
        <p className="docs-sidebar-group">Provider 开发者</p>
        {filteredNav.filter((item) => item[2] === 'developer').map(navLink)}
        {!filteredNav.length && <div className="docs-search-empty" role="status"><span>没有匹配章节，试试其他名称。</span><button type="button" onClick={() => setQuery('')}>清除搜索</button></div>}
        <footer><span>协议版本 1.0</span><a href="mailto:support@zhiyin.us.ci">反馈问题</a></footer>
      </aside>

      <article className="docs-content" id="docs-content" tabIndex={-1}>
        <div className="docs-title"><div className="docs-breadcrumb"><span>知音</span><i>/</i><b>帮助与开发文档</b></div><p>使用指南与开发者参考</p><h1>让连接更简单。</h1><span>第一次使用？从连接音乐源开始。正在开发 Provider？直接查阅协议与接口示例。</span><div className="docs-title-actions"><a href="#start">开始使用 <span aria-hidden="true">↗</span></a><a href="#protocol">开发者协议 <span aria-hidden="true">→</span></a></div></div>

        <div className="docs-section-label"><span>01</span><b>播放器用户指南</b></div>

        <section id="start">
          <h2>快速开始</h2>
          <p>知音只是音乐播放器客户端，不预置、托管或代理音乐内容。搜索结果、播放地址、歌词和封面均由用户选择的独立 Provider 提供。</p>
          <ol>
            <li>注册并登录知音。</li>
            <li>从账户菜单打开“Provider 配置”，点击“添加 Provider”。</li>
            <li>选择官方源或第三方 Provider，填写完整 URL；需要 Header 或 Cookie 时使用高级 JSON。</li>
            <li>点击“认证并添加”。知音后端公开读取发现文件，再将连接凭据和当前账号信息发送到 authenticate 端点换取短期 Token。</li>
            <li>启用 Provider，进入播放器使用其已声明的搜索、榜单、播放、歌词和封面能力。</li>
          </ol>
          <div className="docs-note"><b>连接前检查</b><span>请确认 Provider 的运营主体、服务条款、隐私政策和内容授权范围。兼容本协议只代表接口格式正确，不代表知音对服务或内容进行审核、推荐或授权。</span></div>
        </section>

        <section id="connections">
          <h2>连接方式</h2>
          <p>同一账号可以保存多个 Provider，但同一时间只启用一个。官方源与第三方 Provider 使用完全相同的协议，区别只在于连接配置由系统预置还是由用户提供。</p>
          <div className="docs-cards">
            <article><i>01</i><h3>官方源</h3><p>由系统提供的标准 Provider 连接配置。</p><code>预置配置</code></article>
            <article><i>02</i><h3>第三方 Provider</h3><p>通过完整 URL 或高级 JSON 连接用户选择的独立服务。</p><code>url / headers / credentials</code></article>
          </div>
          <p>编辑已有配置时会先验证新连接，失败不会覆盖原配置。删除配置会永久移除知音加密保存的连接信息。</p>
          <div className="docs-note"><b>配置安全</b><span>完整 URL 和 Header 可能包含敏感值。列表只显示隐藏查询参数后的地址，保存时会加密完整连接配置。</span></div>
        </section>

        <section id="data">
          <h2>数据与 Provider 切换</h2>
          <h3>跨 Provider 歌曲身份</h3>
          <p>收藏使用歌曲原始名称与歌手生成的 <code>songId</code>，不使用某个平台的内部歌曲 ID。因此切换 Provider 后，同一首歌仍保持同一收藏身份；新 Provider 会根据歌曲信息和现有 binding 重新定位自己的播放资源。</p>
          <h3>浏览器数据</h3>
          <p>播放队列、搜索记录、随机历史、榜单缓存和短期资源地址保存在浏览器中，其中播放队列和资源缓存按 Provider 隔离。登录用户的收藏按账号保存，并同步到浏览器供离线展示。</p>
          <h3>播放地址</h3>
          <p>播放 URL 通常有较短有效期。地址过期或实际播放失败时，客户端先丢弃本地结果重新请求一次，仍失败再要求 Provider 强制刷新；Provider 明确返回没有资源时直接切换下一首。连续 8 首无法播放时停止并提示，不会无限重试。</p>
        </section>

        <section id="troubleshooting">
          <h2>常见问题</h2>
          <SimpleTable rows={[
            ['验证失败', '确认地址是 HTTPS Provider 根地址，发现文件可公开访问，端点与根地址同源，并重新填写认证凭证。'],
            ['没有搜索或榜单', '功能由 Provider 的 capabilities 决定；未声明或未实现的能力不会显示。'],
            ['歌曲无法播放', '空 URL、临时 URL 失效或媒体服务器拒绝访问都会导致失败。客户端会自动强制刷新一次，之后需要用户重新播放。'],
            ['歌词或封面为空', '空内容是合法结果，表示 Provider 本次没有匹配资源，不影响歌曲身份与收藏。'],
            ['Provider 请求超时', '所有 Provider 请求最多等待 60 秒；检查服务和上游状态后重试。'],
            ['切换后收藏不能播放', '收藏身份仍保留，但新 Provider 必须能识别 binding，或根据 title、artist、album 重新检索该歌曲。'],
          ]} />
        </section>

        <div className="docs-section-label"><span>02</span><b>Provider 开发规范</b></div>

        <section id="protocol">
          <h2>协议概览</h2>
          <p>Music Provider Protocol（MPP）是知音与独立音乐 Provider 之间的 HTTPS/JSON 协议。客户端不下载或执行 Provider 提供的 JavaScript，只读取发现文件并调用声明的固定端点。</p>
          <ul>
            <li>协议标识固定为 <code>music-provider</code>，当前版本为 <code>1.0</code>。</li>
            <li>发现文件和端点必须使用 HTTPS、保持同源且不得重定向到第三方主机。</li>
            <li>1.x 客户端忽略未知字段；已有字段不能在兼容更新中删除或改变语义。</li>
            <li>Provider 只声明确实实现的能力。协议 1.0 的播放模式为 <code>direct</code>。</li>
            <li>所有 Provider 请求的客户端超时为 60 秒。</li>
          </ul>
          <h3>交互模型</h3>
          <p>知音是服务端客户端：发现、认证、目录、播放解析、歌词和封面请求全部由知音后端发出，浏览器不直接访问 Provider 协议端点；只有 Provider 返回的播放地址和封面地址由浏览器直接加载。其他客户端也可以在浏览器中直接实现本协议，请求与响应格式相同。</p>
          <Code>{`浏览器 ──> 知音后端 ──> Provider 协议端点
浏览器 ──────────────> 播放 URL、封面 URL`}</Code>
        </section>

        <section id="discovery">
          <h2>服务发现</h2>
          <Endpoint method="GET" path="/.well-known/music-provider.json">公开返回 Provider 身份、协议版本、能力、播放配置和端点。发现请求不携带连接凭据，也不得重定向。</Endpoint>
          <Code>{manifestExample}</Code>
          <SchemaTable title="发现文件字段" rows={[
            ['protocol', 'string', '是', '固定为 music-provider。'],
            ['protocolVersion', 'string', '是', '当前为 1.0；客户端拒绝不支持的主版本。'],
            ['provider.id', 'string', '是', '全局稳定的 Provider 标识。'],
            ['provider.name', 'string', '是', '面向用户展示的 Provider 名称。'],
            ['provider.homepage', 'HTTPS URL', '否', 'Provider 官网或运营主体页面。'],
            ['capabilities', 'string[]', '是', 'search、random、charts、playlists、lyrics、artwork、playback、qualities 中已实现的能力；客户端忽略不认识的能力。'],
            ['playback.mode', 'direct', '条件', '声明 playback 时必填；resolve 返回浏览器可尝试播放的 URL。'],
            ['playback.qualities', 'string[]', '否', '声明 qualities 时给出可请求的音质标识。'],
            ['clientAuthentication', 'object', '否', '支持或要求客户端签名时声明：type 为 hmac-sha256，required 表示是否强制。'],
            ['endpoints.authenticate', 'HTTPS URL', '是', '使用连接凭据和客户端账号换取短期 Bearer Token；客户端使用 POST 请求。'],
            ['endpoints.terms', 'HTTPS URL', '是', '服务条款与内容授权范围。'],
            ['endpoints.privacy', 'HTTPS URL', '是', '隐私政策、运营主体与联系方式。'],
            ['endpoints.health', 'HTTPS URL', '否', '健康检查，客户端不依赖它。'],
            ['endpoints.search', 'HTTPS URL', '条件', '声明 search 时必填。'],
            ['endpoints.random', 'HTTPS URL', '条件', '声明 random 时必填。'],
            ['endpoints.charts', 'HTTPS URL', '条件', '声明 charts 时必填。'],
            ['endpoints.playlists', 'HTTPS URL', '条件', '声明 playlists 时必填。'],
            ['endpoints.resolve', 'HTTPS URL', '条件', '声明 playback 时必填。'],
            ['endpoints.lyrics', 'URL template', '条件', '声明 lyrics 时必填，使用 {songId} 占位符。'],
            ['endpoints.artwork', 'URL template', '条件', '声明 artwork 时必填，使用 {songId} 占位符。'],
            ['presentation', 'object', '否', '纯文本固定展示区块；不存在时客户端隐藏。'],
          ]} />
          <SchemaTable title="presentation 固定展示字段" rows={[
            ['title', 'string', '否', '展示区块标题。'],
            ['badge.text', 'string', '否', '状态标签文字。'],
            ['badge.tone', 'string', '否', 'neutral、positive、warning 或 negative，仅控制视觉样式。'],
            ['description', 'string', '否', '辅助说明。'],
            ['items', 'array', '否', '最多 12 个 label/value 纯文本键值项，按返回顺序展示。'],
            ['notice', 'string', '否', '底部提示。'],
          ]} />
          <div className="docs-note"><b>仅用于展示</b><span>客户端不解析 presentation 内容，也不据此判断能力或访问权限；需要机器可读的服务到期时间时使用认证响应中的 account.expiresAt。没有值的字段隐藏，整个对象不存在时不渲染展示区块。</span></div>
          <p>保存的发现文件缺少某个端点时，客户端会重新读取发现文件，同一配置最多每 10 分钟一次，Provider 新增的能力无需用户重新配置即可生效。发现文件中的其他扩展字段（例如 mcp 端点）会被忽略。</p>
        </section>

        <section id="authentication">
          <h2>认证与连接配置</h2>
          <p>客户端不理解 Provider 的凭据含义，只在认证请求中按声明式配置发送 URL 参数和静态 Header，并携带当前知音账号信息。认证成功后，业务请求只使用 Provider 返回的短期 Bearer Token。</p>
          <Endpoint method="POST" path="/v1/auth/authenticate">接收客户端账号上下文，并通过 URL 参数或静态 Header 验证连接凭据；成功时返回短期 Bearer Token。</Endpoint>
          <Code>{connectionExample}</Code>
          <SchemaTable title="连接配置" rows={[
            ['url', 'HTTPS URL', '是', 'Provider 地址；查询参数仅附加到 authenticate 请求。'],
            ['headers', 'object', '否', '仅附加到 authenticate 请求的静态 Header。'],
            ['credentials', 'string', '否', '浏览器客户端的 Cookie 策略：omit、same-origin 或 include，默认 omit。知音由后端发出请求，忽略此字段，也不会转发浏览器 Cookie。'],
          ]} />
          <SchemaTable title="认证请求体" rows={[
            ['clientAccount.id', 'string', '是', '客户端内部账号 ID，最多 100 个字符。'],
            ['clientAccount.name', 'string', '否', '账号显示名称，最多 80 个字符。'],
            ['clientAccount.email', 'string', '是', '去除首尾空格并转为小写的邮箱，最多 160 个字符，是账号的唯一凭证。'],
          ]} />
          <Code>{authenticateResponse}</Code>
          <SchemaTable title="认证响应" rows={[
            ['accessToken', 'string', '是', '短期令牌，其他请求以 Authorization: Bearer 发送。'],
            ['tokenType', 'string', '是', '固定为 Bearer。'],
            ['expiresIn', 'integer', '是', '令牌有效秒数；小于 30 按 30 处理，缺失时按 900 处理。'],
            ['account.status', 'string', '否', '服务状态，例如 active。'],
            ['account.expiresAt', 'ISO 8601 string', '否', '服务到期时间，客户端用它显示剩余时长；没有期限时省略。'],
            ['presentation', 'object', '否', '纯文本展示区块，结构同发现文件。'],
          ]} />
          <p>客户端按用户和 Provider 配置缓存令牌，到期前 15 秒停止使用并重新认证；任何请求返回 401 或 403 时也会丢弃令牌。协议 1.0 没有单独的刷新端点，因此同一凭据和账号大约每 15 分钟认证一次。Provider 必须保证重复认证是幂等的：返回新令牌，不改变服务到期时间，也不重复消耗凭据；同一凭据被其他邮箱使用时返回 409 connection_credential_bound。</p>
          <div className="docs-note"><b>职责边界</b><span>Provider 服务端自行验证连接凭据与客户端账号。客户端不解释凭据，不把原始 key 附加到搜索、歌词或播放等业务请求。</span></div>
        </section>

        <section id="client-signature">
          <h2>客户端签名</h2>
          <p>用户凭证只能证明是哪个用户，无法证明请求来自哪个客户端软件。Provider 只想让自己认可的客户端（例如知音后端）调用时，可以要求客户端对每个协议请求签名。这样即使用户凭证或令牌泄露，未登记的服务端也无法调用。签名是 1.0 的可选扩展，不要求签名的 Provider 忽略这些请求头即可。</p>
          <p>Provider 为每个客户端分配 Client ID 和至少 32 个字符的 Secret。两者只保存在客户端服务端（知音保存在后台的加密数据库中），不下发到浏览器，也不写进连接配置。客户端只要配置了密钥，就对除发现文件外的所有协议请求签名，包括 authenticate。</p>
          <Code>{signatureExample}</Code>
          <SchemaTable title="签名请求头" rows={[
            ['X-Client-Id', 'string', '是', 'Provider 分配的客户端标识。'],
            ['X-Client-Timestamp', 'integer', '是', 'Unix 时间，单位秒；与 Provider 服务器时间相差不得超过 300 秒。'],
            ['X-Client-Signature', 'hex string', '是', 'HMAC-SHA256(Secret, 签名内容) 的 64 位小写十六进制。签名内容依次是大写的 HTTP 方法、实际请求的路径和查询字符串、时间戳、请求体 SHA-256 的小写十六进制（没有请求体时是空字符串的哈希）。'],
          ]} />
          <Code>{signatureCode}</Code>
          <SimpleTable rows={[
            ['401 client_authentication_required', '要求签名但请求缺少签名请求头。'],
            ['401 client_authentication_failed', 'Client ID 不存在、签名错误或时间戳超出范围。'],
            ['403 client_forbidden', '客户端已停用或无权访问该接口。'],
          ]} />
          <div className="docs-note"><b>浏览器客户端</b><span>浏览器无法安全保存 Secret，不能使用签名。Provider 可以另外按 Origin 允许指定网页调用，但浏览器以外的程序可以伪造 Origin；需要强限制时应只接受签名请求。</span></div>
        </section>

        <section id="track-model">
          <h2>Track 与 Binding</h2>
          <p>搜索、随机、榜单、收藏和所有单曲接口共享同一个 Track 模型。歌曲身份、可读元数据和上游资源位置必须分开表达。</p>
          <Code>{trackExample}</Code>
          <SchemaTable title="Track" rows={[
            ['songId', 'string', '是', 'MD5(UTF-8(JSON.stringify([title, artist]))) 的 32 位小写十六进制结果。'],
            ['title', 'string', '是', '参与 songId 计算的原始歌曲名称，不得 trim 或归一化。'],
            ['artist', 'string', '是', '参与 songId 计算的原始歌手名称，不得改写顺序或格式。'],
            ['album', 'string', '是', '原始专辑名称；未知时必须传空字符串，不得省略。'],
            ['duration', 'number', '否', '音频时长，单位秒。'],
            ['art', 'HTTPS URL | empty string', '否', '当前可用于展示的封面地址。'],
            ['binding', 'Binding', '是', '上游资源定位信息。Track 顶层不得重复 source 或 sourceId。'],
            ['rank', 'integer', '榜单条件必填', '榜单中的名次，从 1 开始。'],
          ]} />
          <SchemaTable title="Binding" rows={[
            ['source', 'string', '是', '非空的音乐平台或 API 服务标识。'],
            ['sourceId', 'string', '是', 'source 内部的不透明歌曲标识，客户端不得转换格式。'],
            ['meta', 'JSON object', '是', 'Provider 自定义上下文；可以是空对象，不得为数组、标量或 null，协议不单独规定字段大小上限。'],
            ['art', 'string', '是', '可为空的封面资源提示；封面解析失败时可回退使用。'],
          ]} />
          <div className="docs-note"><b>身份与定位</b><span>songId 用于跨 Provider 去重、收藏和缓存；binding 只负责定位某个平台或 API 服务中的资源。binding.art 不参与歌曲身份或 binding 唯一性判断。</span></div>
        </section>

        <section id="catalog">
          <h2>目录接口</h2>
          <Endpoint method="GET" path="/v1/catalog/search?q={keyword}&page={page}&limit={limit}">返回 {`{ tracks, page, hasMore }`}；无结果时 tracks 为空数组。</Endpoint>
          <Endpoint method="GET" path="/v1/catalog/random?exclude={artists}&era={era}&languages={languages}">返回 {`{ tracks, singer?, playlist?, playlists? }`}，可选字段说明这批歌曲的来源，客户端不依赖它们；exclude 是逐项 URL 编码、逗号分隔的近期艺人列表。era 与 languages 是可选的偏好提示：era 为 new（新歌优先）、any 或 classic（经典老歌）；languages 是逗号分隔的 zh、en、jk、yue、instrumental，表示优先的语言，不传表示不限。Provider 可以忽略不支持的提示，客户端会按批次播放返回的歌曲。</Endpoint>
          <Endpoint method="GET" path="/v1/catalog/charts?platform={platform}&chart={chart}&refresh={refresh}">返回 {`{ platform, chart, title, updatedAt, stale?, tracks }`}；refresh=1 表示用户主动刷新，stale 为 true 表示刷新失败、返回的是上一次成功的数据。</Endpoint>
          <Endpoint method="GET" path="/v1/catalog/playlists?platform={platform}&category={category}&cursor={cursor}">返回一页精选歌单 {`{ platform, category, categories, playlists, nextCursor }`}。categories 是可选风格 {`{ id, name }`} 的列表；每个歌单为 {`{ id, name, cover, trackCount, plays, description }`}；把 nextCursor 作为 cursor 传回取下一页，为 null 时没有更多。</Endpoint>
          <Endpoint method="GET" path="/v1/catalog/playlists?platform={platform}&id={id}">返回一个歌单的详情 {`{ platform, id, name, cover, description, tracks }`}。</Endpoint>
          <SchemaTable title="通用目录规则" rows={[
            ['tracks', 'Track[]', '是', '每一项必须符合统一 Track 与 Binding 模型。'],
            ['page', 'integer', '搜索必填', '从 1 开始的实际页码。'],
            ['hasMore', 'boolean', '搜索必填', '是否可以继续请求下一页。'],
            ['updatedAt', 'ISO 8601 string', '榜单必填', '榜单数据的获取或更新时间。'],
            ['nextCursor', 'string | null', '歌单列表必填', '下一页的游标；null 表示没有更多。'],
            ['refresh', '0 | 1', '请求可选', '为 1 时跳过普通缓存；Provider 可以限制刷新频率。'],
          ]} />
        </section>

        <section id="resources">
          <h2>单曲接口</h2>
          <h3>解析播放资源</h3>
          <Endpoint method="POST" path="/v1/tracks/resolve">接收完整歌曲上下文。Provider 可优先使用 binding，也可按原始 title、artist、album 重新检索并返回新的 binding。</Endpoint>
          <p>客户端和 Provider 对每个 songId 只保留一条最新成功的完整播放结果。有效缓存直接播放，不因用户音质设置变化而失效；缓存不存在、过期或被明确刷新时，才按用户当前音质设置进入解析与降级流程。</p>
          <Code>{resolveRequest}</Code>
          <SchemaTable title="resolve 请求" rows={[
            ['quality', 'string', '否', '期望音质；支持 128k、192k、320k、flac 和 flac24bit。'],
            ['refresh', 'url | decode', '否', 'url 表示地址或网络失败，按用户当前设置的 quality 绕过缓存并重新解析；decode 表示浏览器无法解码，优先尝试请求音质的下一档；请求音质已是最低档时仍保留该档。'],
          ]} />
          <SchemaTable title="resolve 响应" rows={[
            ['songId', 'string', '是', '必须与请求歌曲一致。'],
            ['url', 'HTTPS URL | empty string', '是', '非空时可尝试播放；空字符串表示本次没有取得播放资源。'],
            ['binding', 'Binding', '是', '实际使用或更新后的资源绑定。'],
            ['expiresIn', 'integer', '是', 'expiresAt 缺失或无效时用于推算 URL 到期时间；url 为空时为 0。'],
            ['expiresAt', 'ISO 8601 string', '是', '播放 URL 的绝对到期时间，优先级高于 expiresIn；上游没有有效期限时由 Provider 设置为 30 分钟。'],
            ['requestedQuality', 'string', '否', '客户端请求的音质。'],
            ['quality', 'string | null', '否', '实际解析音质。'],
            ['bitrate', 'integer | null', '否', '实际码率，单位 kbps。'],
            ['degraded', 'boolean', '否', '实际音质是否低于首选档位。'],
            ['qualityVerified', 'boolean', '否', '音质是否由上游码率信息确认。'],
          ]} />
          <Code>{resolveResponse}</Code>
          <p>HTTP 200 与空 URL仍可用于兼容简单 Provider；推荐使用 no_candidate、all_resolvers_failed、quality_unavailable、upstream_timeout 等稳定错误码，让客户端直接切歌、降级或稍后重试：</p>
          <Code>{emptyResolveResponse}</Code>
          <p>Provider 不可达（超时、5xx、网络错误）时客户端只额外重试一次；播放列表连续 8 首无法播放时停止并提示用户。</p>
          <div className="docs-retry-flow"><span>首次 resolve</span><i>→</i><span>地址失败后普通请求复查</span><i>→</i><span>仍失败 refresh=url</span><i>→</i><span>解码失败 refresh=decode</span><i>→</i><span>成功播放或结束重试</span></div>

          <h3>歌词与封面</h3>
          <Endpoint method="GET" path="/v1/tracks/{songId}/lyrics?title=&artist=&album=&binding=">通过查询参数提交歌曲上下文，返回 {`{ songId, lyrics, translation?, binding }`}；没有歌词时 lyrics 为空字符串，外部歌词回退结果的 binding 可以为 null。</Endpoint>
          <Endpoint method="GET" path="/v1/tracks/{songId}/artwork?title=&artist=&album=&binding=&refresh=">返回 {`{ songId, url, binding }`}；没有封面时 url 为空字符串，客户端使用占位图。</Endpoint>
          <SchemaTable title="歌词查询参数" rows={[
            ['title', 'string', '是', '歌曲名称。'],
            ['artist', 'string', '是', '艺人名称。'],
            ['album', 'string', '是', '专辑名称；未知时传空字符串。'],
            ['binding', 'JSON string', '是', '完整 Binding 经 JSON.stringify 和 URL 编码后的字符串。'],
          ]} />
          <SchemaTable title="歌词响应" rows={[
            ['songId', 'string', '是', '对应的稳定歌曲身份。'],
            ['lyrics', 'string', '是', 'LRC 时间轴歌词或纯文本；没有歌词时为空字符串。'],
            ['translation', 'string', '否', '翻译歌词，建议与 lyrics 使用相同时间轴。'],
            ['binding', 'Binding | null', '是', '实际歌词来源；无法绑定到歌曲平台资源的外部回退可以返回 null。'],
          ]} />
          <SchemaTable title="封面响应" rows={[
            ['songId', 'string', '是', '对应的稳定歌曲身份。'],
            ['url', 'HTTPS URL | empty string', '是', '当前封面地址；没有封面时为空字符串。'],
            ['binding', 'Binding', '是', '实际使用或更新后的资源绑定。'],
          ]} />
          <p>歌词和封面请求中的 <code>album</code> 即使为空也必须存在；<code>binding</code> 必须先序列化为 JSON 字符串，再通过 <code>URLSearchParams</code> 进行标准 URL 编码：</p>
          <Code>{resourceRequestExample}</Code>
        </section>

        <section id="methods">
          <h2>HTTP 方法与跨域</h2>
          <SimpleTable rows={[
            ['GET', '发现、health、terms、privacy、search、random、charts、playlists、lyrics、artwork。'],
            ['POST', 'authenticate、resolve。'],
            ['OPTIONS', '仅用于 CORS 预检，不得执行端点业务逻辑。'],
            ['其他方法', '已知端点必须返回 405、Allow 响应头和 method_not_allowed 错误。'],
          ]} />
          <p>知音的协议请求由后端发出，不需要 CORS；浏览器只直接加载播放地址和封面，audio 和 img 不要求 CORS 响应头，音频地址建议支持 Range 请求。在浏览器中直接调用协议端点的客户端，需要 Provider 允许其 Origin、实际使用的请求头以及 GET、POST、OPTIONS：</p>
          <Code>{`Access-Control-Allow-Origin: https://client.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Provider-Key
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400`}</Code>
        </section>

        <section id="errors">
          <h2>错误规范</h2>
          <p>失败响应使用合适的 HTTP 状态码和稳定机器代码。空播放 URL、空歌词和空封面是成功响应，不使用错误状态码。</p>
          <Code>{`{
  "error": {
    "code": "invalid_request",
    "message": "Human-readable message"
  }
}`}</Code>
          <SimpleTable rows={[
            ['400', 'invalid_request / invalid_song_id：字段缺失、Binding 不合法或 songId 校验失败。'],
            ['401 / 403', 'invalid_connection_credential / access_denied：连接凭据无效，或 Provider 拒绝当前请求。'],
            ['401', 'client_authentication_required / client_authentication_failed：客户端签名缺失或无效。'],
            ['403', 'client_forbidden / entitlement_inactive：客户端无权访问，或服务已到期、被停用。'],
            ['409', 'connection_credential_bound：连接凭据已绑定其他客户端账号。'],
            ['404', 'not_found / no_candidate：端点或资源不存在；播放解析没有找到资源。'],
            ['405', 'method_not_allowed：HTTP 方法不符合端点定义，同时返回 Allow。'],
            ['429', 'rate_limited：请求或强制刷新频率超限。'],
            ['501', 'not_supported：请求的能力未实现。'],
            ['502', 'upstream_unavailable / all_resolvers_failed / quality_unavailable：上游暂时不可用或播放解析失败。'],
            ['504', 'provider_timeout：Provider 请求超过客户端 60 秒期限。'],
          ]} />
        </section>

        <section id="security">
          <h2>安全与合规</h2>
          <ul>
            <li>完整 URL、Header 值、Cookie、访问令牌和客户端 Secret 可能包含敏感信息，不得写入日志、分析数据或界面摘要。</li>
            <li>只依赖用户凭证时，凭证泄露后任何人都能调用 Provider；需要限制调用方时应启用客户端签名。</li>
            <li>客户端允许 URL 携带不透明查询参数，但不得解析、修改或向其他来源转发。</li>
            <li>播放 URL 应短期有效，不得暴露上游长期凭证；日志不得记录完整播放 URL。</li>
            <li>发现文件中的端点必须与 Provider 连接地址同源，客户端拒绝重定向和带账号密码的 URL。</li>
            <li>Provider 应公开服务条款、隐私政策、运营主体、联系方式和权利投诉渠道。</li>
            <li>只可提供自有、已获授权、开放许可或用户依法有权访问的内容，不得绕过访问控制或数字版权保护措施。</li>
          </ul>
        </section>

        <footer className="docs-footer"><span>Music Provider Protocol 1.0</span><a href="mailto:support@zhiyin.us.ci">问题反馈：support@zhiyin.us.ci</a></footer>
      </article>

      <aside className="docs-outline"><p>本页目录</p>{nav.filter((item) => item[2] === (nav.find(([id]) => id === activeSection)?.[2] || 'developer')).map(navLink)}</aside>
    </div>
  </main>;
}
