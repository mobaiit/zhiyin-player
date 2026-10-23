import { useCallback, useEffect, useState } from 'react';
import Turnstile from './Turnstile';
import { LoadingScreen, Spinner, Toast } from './UiFeedback';
import ThemeToggle from '../components/ThemeToggle';
import './admin-netease.css';
import './admin-ux.css';
import './account-provider.css';
import './ui-feedback.css';

const api = async (path, options = {}) => { const response = await fetch(`/api/${path}`, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw Error(data.error || '请求失败，请稍后重试'); return data; };
const formatDate = (value) => value ? new Date(value).toLocaleString('zh-CN') : '—';
const ADMIN_NAV = [
  ['users', 'users', '用户管理'],
  ['admins', 'shield', '管理员账号'],
  ['email', 'mail', 'SMTP 邮件'],
];
const ADMIN_PAGE_TITLES = { users: '用户管理', admins: '管理员账号', email: 'SMTP 邮件' };

export default function Admin() {
  const [booting, setBooting] = useState(true); const [admin, setAdmin] = useState(null); const [page, setPage] = useState('users'); const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: '' }); const [toast, setToast] = useState(null); const [accountOpen, setAccountOpen] = useState(false); const [navOpen, setNavOpen] = useState(false); const [passwordOpen, setPasswordOpen] = useState(false);
  const notify = useCallback((title, message = '', type = 'info') => setToast({ title, message, type }), []);
  useEffect(() => { Promise.all([api('auth/me'), api('admin/me').catch(() => ({ admin: null }))]).then(([me, session]) => { setTurnstile(me.turnstile || { enabled: false, siteKey: '' }); setAdmin(session.admin || null); }).catch((error) => notify('加载失败', error.message, 'error')).finally(() => setBooting(false)); }, [notify]);
  if (booting) return <LoadingScreen label="正在加载管理后台…" />;
  if (!admin) return <><AdminLogin turnstile={turnstile} done={setAdmin} notify={notify} /><Toast toast={toast} onClose={() => setToast(null)} /></>;
  const logout = async () => { setAccountOpen(false); try { await api('admin/logout', { method: 'POST' }); setAdmin(null); notify('已退出登录', '', 'success'); } catch (error) { notify('退出失败', error.message, 'error'); } };
  const selectPage = (nextPage) => { setPage(nextPage); setAccountOpen(false); setNavOpen(false); };
  return <main className="admin-page">
    <aside className={navOpen ? 'is-open' : ''} aria-label="后台导航">
      <a className="admin-brand" href="/admin">知音后台</a>
      <nav>{ADMIN_NAV.map(([value, icon, label]) => <button key={value} className={page === value ? 'active' : ''} aria-current={page === value ? 'page' : undefined} onClick={() => selectPage(value)}><AdminIcon name={icon} /><span>{label}</span></button>)}<a className="admin-nav-link" href="/docs" target="_blank" rel="noreferrer"><AdminIcon name="docs" /><span>使用文档</span></a></nav>
    </aside>
    {navOpen && <button className="admin-nav-backdrop" type="button" aria-label="关闭后台导航" onClick={() => setNavOpen(false)} />}
    <section className="admin-content">
      <header><button className="admin-nav-toggle" type="button" aria-label="打开后台导航" aria-expanded={navOpen} onClick={() => setNavOpen(true)}><AdminIcon name="menu" /></button><div className="admin-context"><small>知音后台</small><strong>{ADMIN_PAGE_TITLES[page]}</strong></div><div className="admin-header-actions"><ThemeToggle /><div className="admin-current-account"><button className="admin-account-trigger" type="button" aria-expanded={accountOpen} aria-label={`当前登录账号 ${admin.username}`} onClick={() => setAccountOpen((value) => !value)}><AdminIcon name="user" /><span>{admin.username}</span><AdminIcon name="chevron" /></button>{accountOpen && <><button className="admin-account-backdrop" type="button" aria-label="关闭账号菜单" onClick={() => setAccountOpen(false)} /><section className="admin-account-menu"><button type="button" onClick={() => { setPasswordOpen(true); setAccountOpen(false); }}><AdminIcon name="lock" />修改密码</button><button type="button" className="admin-logout" onClick={logout}><AdminIcon name="logout" />退出登录</button></section></>}</div></div></header>
      {page === 'users' && <Users notify={notify} />}{page === 'admins' && <AdminAccounts notify={notify} />}{page === 'email' && <EmailConfig notify={notify} />}
    </section>
    {passwordOpen && <AdminPassword close={() => setPasswordOpen(false)} notify={notify} />}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </main>;
}

function AdminLogin({ turnstile, done, notify }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState(''); const [reset, setReset] = useState(0); const [loading, setLoading] = useState(false);
  useEffect(() => () => document.activeElement?.blur?.(), []);
  const resetTurnstile = useCallback(() => { setToken(''); setReset((value) => value + 1); }, []);
  const submit = async (event) => { event.preventDefault(); if (turnstile.enabled && !token) return notify('请先完成人机验证', '请完成下方的 Turnstile 验证后再尝试', 'warning'); setLoading(true); try { const data = await api('admin/login', { method: 'POST', body: JSON.stringify({ username, password, turnstileToken: token }) }); document.activeElement?.blur?.(); notify('登录成功', '', 'success'); done(data.admin); } catch (error) { notify('登录失败', error.message, 'error'); resetTurnstile(); } finally { setLoading(false); } };
  return <main className="admin-login"><ThemeToggle /><form onSubmit={submit}><div className="admin-login-brand"><h1>知音后台</h1></div><label>账号<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required /></label><PasswordField label="密码" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />{turnstile.enabled && <Turnstile siteKey={turnstile.siteKey} onVerify={setToken} onExpire={resetTurnstile} resetSignal={reset} />}<button disabled={loading || (turnstile.enabled && !token)}>{loading ? <><Spinner /> 登录中…</> : '登录后台'}</button></form></main>;
}

function Users({ notify }) {
  const [data, setData] = useState(null); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [loading, setLoading] = useState(false); const [acting, setActing] = useState(false); const [confirmId, setConfirmId] = useState(''); const [years, setYears] = useState(1); const [cleanupConfirm, setCleanupConfirm] = useState(false); const [cleanupOpen, setCleanupOpen] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setData(await api(`admin/users?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${page}`)); } catch (error) { notify('用户加载失败', error.message, 'error'); } finally { setLoading(false); } }, [query, status, page, notify]);
  useEffect(() => { load(); }, [load]);
  const toggleDisabled = async (user) => { setActing(true); try { await api('admin/user-status', { method: 'POST', body: JSON.stringify({ id: user.id, disabled: user.status !== '已禁用' }) }); notify(user.status === '已禁用' ? '账号已启用' : '账号已禁用', '', 'success'); load(); } catch (error) { notify('操作失败', error.message, 'error'); } finally { setActing(false); } };
  const remove = async (id) => { if (confirmId !== id) { setConfirmId(id); return; } setActing(true); try { await api('admin/user-delete', { method: 'POST', body: JSON.stringify({ id }) }); notify('删除成功', '用户账号及相关数据已删除', 'success'); setConfirmId(''); load(); } catch (error) { notify('删除失败', error.message, 'error'); } finally { setActing(false); } };
  const cleanup = async () => { if (!cleanupConfirm) { setCleanupConfirm(true); return; } setActing(true); try { const result = await api('admin/users-cleanup', { method: 'POST', body: JSON.stringify({ years }) }); notify('清理完成', `已删除 ${result.deleted} 个长期未登录用户`, 'success'); setCleanupConfirm(false); setCleanupOpen(false); load(); } catch (error) { notify('清理失败', error.message, 'error'); } finally { setActing(false); } };
  return <section className="admin-view">
    <div className="view-heading"><div><span>USER ACCOUNTS</span><h1>用户管理</h1><p>管理用户状态、登录记录和 Provider 配置概况。</p></div><button className="admin-secondary-action" type="button" onClick={() => { setCleanupConfirm(false); setCleanupOpen(true); }}>清理用户</button></div>
    <div className="filters"><select aria-label="用户状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option></select><input aria-label="搜索用户" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索名称或邮箱" /><button onClick={load} disabled={loading}>{loading ? <Spinner /> : '查询'}</button></div>
    {loading && !data ? <div className="admin-inline-loading"><Spinner />加载中…</div> : <><div className="user-table"><div className="user-row head"><span>用户</span><span>状态</span><span>最后登录</span><span>注册时间</span><span>Provider</span><span>管理</span></div>{data?.items.length ? data.items.map((user) => <div className="user-row" key={user.id}><span className="user-identity" data-label="用户"><b>{user.display_name}</b><small>{user.email}</small></span><span data-label="状态"><b className={`tag ${user.status}`}>{user.status}</b></span><span data-label="最后登录">{formatDate(user.last_login_at)}</span><span data-label="注册时间">{formatDate(user.created_at)}</span><span className="user-identity" data-label="Provider"><b>{user.provider_count} 个</b><small>{user.active_provider || '未激活'}</small></span><span className="row-actions" data-label="管理"><button disabled={acting} onClick={() => toggleDisabled(user)}>{user.status === '已禁用' ? '启用' : '禁用'}</button><button disabled={acting} className={confirmId === user.id ? 'confirm-delete' : ''} onClick={() => remove(user.id)}>{confirmId === user.id ? '确认' : '删除'}</button></span></div>) : <div className="admin-empty">暂无用户</div>}</div><div className="pager"><button disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>上一页</button><span>第 {page} 页 / 共 {Math.max(1, Math.ceil((data?.total || 0) / (data?.size || 20)))} 页</span><button disabled={loading || page * (data?.size || 20) >= (data?.total || 0)} onClick={() => setPage(page + 1)}>下一页</button></div></>}
    {cleanupOpen && <div className="admin-modal" role="dialog" aria-modal="true" aria-label="清理长期未登录用户"><section className="small-modal"><button className="modal-close" onClick={() => setCleanupOpen(false)} aria-label="关闭">×</button><header><span>USER CLEANUP</span><h2>清理长期未登录用户</h2><p>将同时删除符合条件的账号、会话和 Provider 配置。</p></header><div className="admin-dialog-field"><label htmlFor="cleanup-years">未登录时长</label><span><input id="cleanup-years" type="number" min="1" max="100" value={years} onChange={(event) => { setYears(Math.max(1, Number(event.target.value))); setCleanupConfirm(false); }} /><small>年</small></span></div><div className="admin-dialog-actions"><button type="button" onClick={() => setCleanupOpen(false)}>取消</button><button type="button" className="danger" onClick={cleanup} disabled={acting}>{cleanupConfirm ? `确认清理 ${years} 年未登录用户` : '继续清理'}</button></div></section></div>}
  </section>;
}

function AdminAccounts({ notify }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [creating, setCreating] = useState(false); const [createOpen, setCreateOpen] = useState(false); const [confirmId, setConfirmId] = useState(''); const [editing, setEditing] = useState(null); const [query, setQuery] = useState(''); const [page, setPage] = useState(1);
  const load = useCallback(async () => { try { setData(await api('admin/accounts')); } catch (error) { notify('管理员账号加载失败', error.message, 'error'); } finally { setLoading(false); } }, [notify]);
  useEffect(() => { load(); }, [load]);
  const create = async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); if (form.get('password') !== form.get('confirm')) return notify('两次密码不一致', '请检查确认密码后再提交', 'warning'); setCreating(true); try { await api('admin/accounts', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password') }) }); formElement.reset(); setCreateOpen(false); notify('添加成功', '新管理员账号已创建', 'success'); load(); } catch (error) { notify('添加失败', error.message, 'error'); } finally { setCreating(false); } };
  const remove = async (id) => { if (confirmId !== id) { setConfirmId(id); return; } try { await api('admin/account-delete', { method: 'POST', body: JSON.stringify({ id }) }); notify('删除成功', '', 'success'); setConfirmId(''); load(); } catch (error) { notify('删除失败', error.message, 'error'); } };
  const filtered = (data?.items || []).filter((account) => account.username.toLowerCase().includes(query.trim().toLowerCase()));
  const size = 8; const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const visible = filtered.slice((currentPage - 1) * size, currentPage * size);
  return <section className="admin-view">
    <div className="view-heading"><div><span>ADMIN ACCOUNTS</span><h1>管理员账号</h1><p>添加管理员、重置密码或移除不再使用的账号。</p></div><button className="admin-secondary-action primary" type="button" onClick={() => setCreateOpen(true)}>添加管理员</button></div>
    <div className="filters admin-list-search"><input aria-label="搜索管理员" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索管理员账号" /><span>{filtered.length} 个账号</span></div>
    <div className="admin-account-list">{loading ? <div className="admin-inline-loading"><Spinner />加载中…</div> : visible.length ? visible.map((account) => <div key={account.id}><span><b>{account.username}</b><small>{account.id === data.currentId ? '当前登录账号' : `创建于 ${formatDate(account.created_at)}`}</small></span><span className="row-actions"><button onClick={() => setEditing(account)}>修改密码</button><button disabled={account.id === data.currentId} className={confirmId === account.id ? 'confirm-delete' : ''} onClick={() => remove(account.id)}>{confirmId === account.id ? '确认删除' : '删除'}</button></span></div>) : <div className="admin-empty">未找到管理员账号</div>}</div>
    <div className="pager"><button disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>第 {currentPage} 页 / 共 {pages} 页</span><button disabled={currentPage >= pages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
    {createOpen && <div className="admin-modal" role="dialog" aria-modal="true" aria-label="添加管理员"><section className="small-modal"><button className="modal-close" onClick={() => setCreateOpen(false)} aria-label="关闭">×</button><header><span>NEW ADMIN</span><h2>添加管理员</h2><p>创建一个新的后台管理账号。</p></header><form className="admin-form" onSubmit={create}><label>管理员账号<input name="username" minLength="3" maxLength="32" pattern="[A-Za-z0-9_.-]+" autoComplete="off" autoFocus required /></label><PasswordField label="密码" name="password" minLength="8" autoComplete="new-password" required /><PasswordField label="确认密码" name="confirm" minLength="8" autoComplete="new-password" required /><button className="primary" disabled={creating}>{creating ? <><Spinner /> 添加中…</> : '添加管理员'}</button></form></section></div>}
    {editing && <AdminAccountPassword account={editing} close={() => setEditing(null)} notify={notify} />}
  </section>;
}

function AdminAccountPassword({ account, close, notify }) {
  const [loading, setLoading] = useState(false); const submit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (form.get('password') !== form.get('confirm')) return notify('两次密码不一致', '请检查确认密码后再提交', 'warning'); setLoading(true); try { await api('admin/account-password', { method: 'POST', body: JSON.stringify({ id: account.id, password: form.get('password') }) }); notify('修改成功', `${account.username} 的密码已更新`, 'success'); close(); } catch (error) { notify('修改失败', error.message, 'error'); } finally { setLoading(false); } };
  return <div className="admin-modal" role="dialog" aria-modal="true" aria-label="修改管理员密码"><section className="small-modal"><button className="modal-close" onClick={close} aria-label="关闭">×</button><header><span>RESET PASSWORD</span><h2>修改 {account.username} 的密码</h2></header><form className="admin-form" onSubmit={submit}><PasswordField label="新密码" name="password" minLength="8" autoComplete="new-password" required /><PasswordField label="确认密码" name="confirm" minLength="8" autoComplete="new-password" required /><button className="primary" disabled={loading}>{loading ? <><Spinner /> 保存中…</> : '保存新密码'}</button></form></section></div>;
}

function AdminPassword({ close, notify }) {
  const [loading, setLoading] = useState(false);
  const submit = async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); if (form.get('next') !== form.get('confirm')) return notify('两次密码不一致', '请检查确认密码后再提交', 'warning'); setLoading(true); try { await api('admin/password', { method: 'POST', body: JSON.stringify({ currentPassword: form.get('current'), newPassword: form.get('next') }) }); formElement.reset(); close(); notify('修改成功', '管理员密码已更新', 'success'); } catch (error) { notify('修改失败', error.message, 'error'); } finally { setLoading(false); } };
  return <div className="admin-modal" role="dialog" aria-modal="true" aria-label="修改密码"><section className="small-modal"><button className="modal-close" onClick={close} aria-label="关闭">×</button><header><span>SECURITY</span><h2>修改密码</h2><p>更新当前管理员账号的登录密码。</p></header><form className="admin-form" onSubmit={submit}><PasswordField label="当前密码" name="current" autoComplete="current-password" required autoFocus /><PasswordField label="新密码" name="next" minLength="8" autoComplete="new-password" required /><PasswordField label="确认新密码" name="confirm" minLength="8" autoComplete="new-password" required /><button className="primary" disabled={loading}>{loading ? <><Spinner /> 保存中…</> : '保存修改'}</button></form></section></div>;
}

function EmailConfig({ notify }) {
  const [config, setConfig] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [testing, setTesting] = useState(false); const [recipient, setRecipient] = useState(''); const [editOpen, setEditOpen] = useState(false); const [testOpen, setTestOpen] = useState(false);
  useEffect(() => { api('admin/email-config').then(setConfig).catch((error) => notify('SMTP 配置加载失败', error.message, 'error')).finally(() => setLoading(false)); }, [notify]);
  const submit = async (event) => { event.preventDefault(); const formElement = event.currentTarget; const passwordInput = formElement.elements.namedItem('password'); const form = new FormData(formElement); setSaving(true); try { const data = await api('admin/email-config', { method: 'POST', body: JSON.stringify({ host: form.get('host'), port: Number(form.get('port')), secure: form.get('secure') === 'on', authType: form.get('authType'), username: form.get('username'), password: form.get('password'), from: form.get('from'), fromName: form.get('fromName'), replyTo: form.get('replyTo') }) }); setConfig(data); if (passwordInput) passwordInput.value = ''; setEditOpen(false); notify('保存成功', 'SMTP 配置已加密保存，可以发送测试邮件验证连接', 'success'); } catch (error) { notify('保存失败', error.message, 'error'); } finally { setSaving(false); } };
  const test = async () => { setTesting(true); try { await api('admin/email-test', { method: 'POST', body: JSON.stringify({ recipient }) }); setTestOpen(false); notify('测试邮件已发送', `请检查 ${recipient} 的收件箱`, 'success'); } catch (error) { notify('测试失败', error.message, 'error'); } finally { setTesting(false); } };
  const sourceLabel = config?.source === 'database' ? '后台配置' : config?.source === 'environment' ? '环境变量配置' : '尚未配置';
  return <section className="admin-view">
    <div className="view-heading"><div><span>SMTP DELIVERY</span><h1>SMTP 邮件配置</h1><p>用于注册与重置密码验证码；密码或授权码会加密保存且不会回显。</p></div><button className="admin-secondary-action primary" type="button" onClick={() => setEditOpen(true)}>编辑配置</button></div>
    {loading ? <div className="admin-inline-loading"><Spinner /><span>加载中…</span></div> : <div className="admin-config-list"><div><span>配置状态</span><strong className={config?.configured ? 'tone-positive' : ''}>{config?.configured ? '已配置' : '未配置'}</strong></div><div><span>配置来源</span><strong>{sourceLabel}</strong></div><div><span>SMTP 主机</span><strong>{config?.host || '—'}</strong></div><div><span>端口与加密</span><strong>{config?.port || '—'} · {config?.secure ? 'TLS/SSL' : 'STARTTLS'}</strong></div><div><span>认证方式</span><strong>{config?.authType?.toUpperCase() || '—'}</strong></div><div><span>发件人</span><strong>{config?.fromName || '知音'} &lt;{config?.from || '—'}&gt;</strong></div><div className="admin-config-actions"><span>连接验证</span><button type="button" onClick={() => setTestOpen(true)} disabled={!config?.configured}>发送测试邮件</button></div></div>}
    {editOpen && <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="编辑 SMTP 配置"><button className="admin-drawer-backdrop" type="button" aria-label="关闭" onClick={() => setEditOpen(false)} /><aside><header><div><span>SMTP SETTINGS</span><h2>编辑 SMTP 配置</h2><p>敏感凭据将加密保存，已有密码不会回显。</p></div><button className="modal-close" type="button" onClick={() => setEditOpen(false)} aria-label="关闭">×</button></header><form className="admin-form smtp-config-form" onSubmit={submit}><label>SMTP 主机<input name="host" defaultValue={config?.host} placeholder="smtp.example.com" required autoFocus /></label><label>端口<input name="port" type="number" min="1" max="65535" defaultValue={config?.port || 465} required /></label><label>认证方式<select name="authType" defaultValue={config?.authType || 'plain'}><option value="plain">PLAIN</option><option value="login">LOGIN</option><option value="cram-md5">CRAM-MD5</option></select></label><label>SMTP 用户名<input name="username" defaultValue={config?.username} autoComplete="username" /></label><PasswordField label="SMTP 密码 / 授权码" name="password" autoComplete="new-password" placeholder={config?.passwordConfigured ? '已配置；留空保持不变' : '请输入密码或授权码'} /><label>发件邮箱<input name="from" type="email" defaultValue={config?.from || 'no-reply@zhiyin.us.ci'} required /></label><label>发件名称<input name="fromName" defaultValue={config?.fromName || '知音'} /></label><label>回复邮箱<input name="replyTo" type="email" defaultValue={config?.replyTo} placeholder="可选" /></label><label className="smtp-checkbox"><input name="secure" type="checkbox" defaultChecked={config?.secure ?? true} />使用 TLS/SSL（通常为 465 端口）</label><p className="field-help">465 端口通常启用 TLS/SSL；587 端口通常关闭该选项并使用 STARTTLS。修改时密码留空会保留原值。</p><button className="primary" disabled={saving}>{saving ? <><Spinner /> 保存中…</> : '保存 SMTP 配置'}</button></form></aside></div>}
    {testOpen && <div className="admin-modal" role="dialog" aria-modal="true" aria-label="发送测试邮件"><section className="small-modal"><button className="modal-close" onClick={() => setTestOpen(false)} aria-label="关闭">×</button><header><span>DELIVERY TEST</span><h2>发送测试邮件</h2><p>验证当前 SMTP 配置是否能够正常投递。</p></header><div className="admin-dialog-field"><label htmlFor="test-recipient">收件邮箱</label><input id="test-recipient" type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="name@example.com" autoFocus /></div><div className="admin-dialog-actions"><button type="button" onClick={() => setTestOpen(false)}>取消</button><button type="button" className="primary" onClick={test} disabled={testing || !recipient}>{testing ? <><Spinner /> 发送中…</> : '发送测试'}</button></div></section></div>}
  </section>;
}

function AdminIcon({ name }) {
  const paths = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    docs: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M4 4.5v17M8 7h8M8 11h7" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return <svg className="admin-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function PasswordField({ label, ...props }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-input"><input {...props} type={visible ? 'text' : 'password'} /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? '隐藏内容' : '显示内容'} title={visible ? '隐藏' : '显示'}><EyeIcon crossed={!visible} /></button></span></label>;
}

function EyeIcon({ crossed = false }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" />{crossed && <path d="m4 4 16 16" />}</svg>; }
