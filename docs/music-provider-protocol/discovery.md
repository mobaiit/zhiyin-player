# 发现与校验

客户端从连接配置 `url` 的 origin 读取 `/.well-known/music-provider.json`。发现请求是公开请求，不携带连接配置中的查询参数、Header 或任何连接凭据。

Provider 必须直接返回 HTTP 200 和 `application/json`，不得通过 3xx 重定向提供发现结果。发现文件可以被缓存，建议 `Cache-Control: public, max-age=3600`。

```json
{
  "protocol": "music-provider",
  "protocolVersion": "1.0",
  "provider": {
    "id": "example",
    "name": "Example Provider",
    "homepage": "https://provider.example"
  },
  "capabilities": ["search", "random", "charts", "playlists", "lyrics", "artwork", "playback", "qualities"],
  "playback": {
    "mode": "direct",
    "qualities": ["128k", "192k", "320k", "flac", "flac24bit"]
  },
  "clientAuthentication": {
    "type": "hmac-sha256",
    "required": false
  },
  "endpoints": {
    "authenticate": "https://provider.example/v1/auth/authenticate",
    "health": "https://provider.example/health",
    "terms": "https://provider.example/terms",
    "privacy": "https://provider.example/privacy",
    "search": "https://provider.example/v1/catalog/search",
    "random": "https://provider.example/v1/catalog/random",
    "charts": "https://provider.example/v1/catalog/charts",
    "playlists": "https://provider.example/v1/catalog/playlists",
    "resolve": "https://provider.example/v1/tracks/resolve",
    "lyrics": "https://provider.example/v1/tracks/{songId}/lyrics",
    "artwork": "https://provider.example/v1/tracks/{songId}/artwork"
  }
}
```

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `protocol` | 是 | 固定为 `music-provider`。 |
| `protocolVersion` | 是 | 固定为 `1.0`，客户端拒绝其他版本。 |
| `provider.id` | 是 | 稳定的 Provider 标识。客户端用它判断重新发现时是否仍是同一个 Provider。 |
| `provider.name` | 是 | 面向用户展示的名称。 |
| `provider.homepage` | 否 | Provider 官网或运营主体页面。 |
| `capabilities` | 是 | 已实现的能力，见[能力与播放](capabilities.md)。 |
| `playback.mode` | 条件 | 声明 `playback` 时必填，1.0 只有 `direct`。 |
| `playback.qualities` | 条件 | 声明 `qualities` 时给出可请求的音质标识。 |
| `clientAuthentication` | 否 | Provider 支持或要求[客户端签名](client-signature.md)时声明。 |
| `endpoints.authenticate` | 是 | 用连接凭据和客户端账号换取短期 Bearer Token。 |
| `endpoints.terms`、`endpoints.privacy` | 是 | 服务条款与隐私政策，客户端缺少任一项时拒绝连接。 |
| `endpoints.health` | 否 | 健康检查，客户端不依赖它。 |
| 其他 `endpoints.*` | 条件 | 声明对应能力时必填。 |
| `presentation` | 否 | 纯文本展示区块，见下文。 |

歌词和封面端点是 URL 模板，使用 `{songId}` 占位符，客户端替换前对 `songId` 做 URL 编码。

## 端点校验

客户端对发现文件中的每个端点执行以下检查，任一项不通过即拒绝连接：

- 必须使用 HTTPS；
- 必须与连接配置 `url` 同源；
- 不得包含 URL 用户名或密码。

客户端调用任何协议端点时都拒绝 3xx 重定向，要求 Provider 直接返回最终响应。

## 重新发现

客户端会保存连接时读取的发现文件，并在以下情况重新读取：

- 重新认证；
- 请求一个已保存的发现文件中没有的端点。这样 Provider 新增的能力无需用户重新配置就能生效，客户端每个配置最多每 10 分钟重新读取一次。

重新发现失败，或 `provider.id` 与保存时不同，客户端继续使用已保存的发现文件，不会切换到另一个 Provider。

## 扩展字段

Provider 可以在发现文件中声明协议之外的端点或能力，例如 `endpoints.mcp` 与 `mcp` 能力。客户端忽略不认识的字段和能力，不会因此拒绝连接。

## 可选展示区块

`presentation` 仅用于固定渲染，所有字段均为纯文本：

- `title`、`description`、`notice`：可选字符串；
- `badge.text`：可选状态文字；
- `badge.tone`：可选值 `neutral`、`positive`、`warning`、`negative`；
- `items`：最多 12 个 `{ label, value }`，顺序由 Provider 决定。

客户端不得根据 `presentation` 判断权限或启停功能。需要机器可读的服务状态时，使用认证响应中的 `account` 字段，见[连接配置与认证](authentication.md)。字段不存在时隐藏对应元素，`presentation` 不存在时隐藏整个区块。

`authenticate` 响应也可以返回 `presentation`，结构相同。两者同时存在时，客户端优先展示认证响应中的版本，因为它可以包含与当前连接相关的信息。
