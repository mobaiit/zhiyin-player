# ZY MUSIC

ZY MUSIC 是一个可扩展的 Web 音乐播放器，支持通过 Music Provider Protocol 连接用户选择的内容服务。

线上地址：https://zhiyin.us.ci

## 功能

- 音乐搜索、随机推荐与榜单
- 播放队列、歌词、封面和多档音质
- 用户注册、登录、找回密码和账号管理
- 收藏同步与播放偏好
- Music Provider 添加、验证、启停和切换
- 用户、管理员和邮件配置后台
- Cloudflare Turnstile 人机验证
- 可配置 SMTP 发件服务与测试邮件

ZY MUSIC 仅提供播放器、账号系统和 Provider 接入能力，不托管、缓存、代理或分发音频内容。音乐数据由用户配置的第三方 Provider 提供。

## 技术栈

- React 19
- Vite 8
- Cloudflare Workers
- Cloudflare Workers Static Assets
- Cloudflare D1
- Web Crypto API / AES-GCM
- SMTP over Workers TCP Sockets

## 页面入口

- 播放器：`/`
- Provider 协议文档：`/docs`
- 管理后台：`/?admin=1`
- API：`/api/*`

## 本地开发

```bash
npm install
npm run dev
```

如需在本地联调 Worker、D1 和 API：

```bash
npx wrangler d1 migrations apply zhiyin-player --local
npm run build
npx wrangler dev
```

## 环境配置

复制 `.env.example` 中需要的配置到本地环境文件。包含凭据的文件必须保持在 Git 忽略范围内。

主要配置项：

- `PROVIDER_CREDENTIAL_KEY`：加密 Provider 凭据与 SMTP 密码
- `ADMIN_BOOTSTRAP_USERNAME`：首次管理员用户名，默认 `admin`
- `ADMIN_BOOTSTRAP_PASSWORD`：首次管理员密码
- `TURNSTILE_SITE_KEY`：Turnstile Site Key
- `TURNSTILE_SECRET_KEY`：Turnstile Secret Key
- `SMTP_*`：SMTP 回退配置

生产环境中的敏感配置使用 Wrangler Secret：

```bash
npx wrangler secret put PROVIDER_CREDENTIAL_KEY
npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

## 数据库

执行本地迁移：

```bash
npx wrangler d1 migrations apply zhiyin-player --local
```

执行远程迁移：

```bash
npx wrangler d1 migrations apply zhiyin-player --remote
```

## SMTP

管理员可在后台配置：

- SMTP 主机与端口
- TLS 或 STARTTLS
- PLAIN、LOGIN 或 CRAM-MD5 认证
- 发件邮箱、发件名称与回复邮箱
- 测试收件人与测试邮件

SMTP 密码使用 `PROVIDER_CREDENTIAL_KEY` 派生的 AES-GCM 密钥加密后保存到 D1，接口不会回显密码。

## 构建与检查

```bash
npm run lint
npm run build
npx wrangler deploy --dry-run
```

## 部署

`wrangler.toml` 已配置 Worker、静态资源、D1 数据库和自定义域名。完成 Cloudflare 登录后执行：

```bash
npm run build
npx wrangler deploy
```

生产域名为 `zhiyin.us.ci`。

## 项目结构

```text
functions/      Worker API 模块
migrations/     D1 数据库迁移
public/         静态资源
shared/         前后端共享逻辑
src/            React 应用
worker.js       Worker 入口
wrangler.toml   Cloudflare 部署配置
```

## License

本项目采用仓库中声明的许可证条款。
