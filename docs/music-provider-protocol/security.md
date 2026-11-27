# 错误、CORS 与安全

## 错误结构

错误响应统一为：

```json
{ "error": { "code": "invalid_request", "message": "Human-readable message" } }
```

| 状态码 | 错误码 | 含义 |
|---|---|---|
| 400 | `invalid_request` | 字段缺失、取值超出范围或 Binding 不合法。 |
| 401 | `access_denied` | 访问令牌缺失、无效或已过期。客户端丢弃令牌并重新认证。 |
| 401 / 403 | `invalid_connection_credential` | 连接凭据无效或已不可用。 |
| 401 | `client_authentication_required`、`client_authentication_failed` | 客户端签名缺失或无效，见[客户端签名](client-signature.md)。 |
| 403 | `client_forbidden` | 客户端已停用或无权访问该接口。 |
| 403 | `entitlement_inactive` | 服务已到期或被停用。 |
| 404 | `not_found`、`no_candidate` | 端点或资源不存在；播放解析没有找到资源。 |
| 405 | `method_not_allowed` | HTTP 方法不符合端点定义，同时返回 `Allow` 响应头。 |
| 409 | `connection_credential_bound` | 连接凭据已绑定其他账号。 |
| 429 | `rate_limited` | 请求或强制刷新频率超限。 |
| 502 | `upstream_unavailable`、`all_resolvers_failed`、`quality_unavailable` | 上游暂时不可用；播放解析失败。 |
| 501 | `not_supported` | 请求的能力未实现。 |
| 504 | `provider_timeout`、`upstream_timeout` | 请求超时。 |

客户端可以把这些错误码映射为本地化提示；未知错误使用 Provider 返回的 `message`，但不推断 Provider 的验证规则。

## HTTP 方法

| 方法 | 端点 |
|---|---|
| `GET` | 发现、health、terms、privacy、search、random、charts、playlists、lyrics、artwork |
| `POST` | authenticate、resolve |
| `OPTIONS` | 只用于 CORS 预检，不得执行业务逻辑 |

已知端点收到其他方法时，必须返回 405、`Allow` 响应头和标准错误结构。

## CORS

是否需要 CORS 取决于客户端在哪里发出请求：

- **服务端客户端**（知音）：协议请求由知音后端发出，不需要 CORS。浏览器只直接加载播放地址和封面，`<audio>` 和 `<img>` 不要求 CORS 响应头。
- **浏览器客户端**：Provider 必须为允许的客户端 Origin 配置 CORS。使用自定义 Header 时，应在 `Access-Control-Allow-Headers` 中列出；使用 Cookie 时，还必须返回 `Access-Control-Allow-Credentials: true`，且 `Access-Control-Allow-Origin` 不能为 `*`。

```http
Access-Control-Allow-Origin: https://client.example
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Provider-Key
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

## 安全

- 连接配置可能包含敏感值。客户端和 Provider 不得在日志、分析数据、错误消息或界面摘要中输出完整 URL、Header 值、Cookie、访问令牌、客户端 Secret 或完整播放 URL。
- 客户端保存连接配置和客户端 Secret 时应加密，列表展示时隐藏 URL 查询参数。
- 协议端点必须与发现地址同源，避免连接凭据被发送到其他主机。
- 客户端必须限制请求大小、超时和重试次数，并拒绝非 HTTPS 地址、重定向、受限 Header、HTML 与远程脚本。
- 播放 URL 应短期有效，不得暴露上游的长期凭证。
- 只依赖用户凭证时，凭证泄露后任何人都能调用 Provider。需要限制调用方的 Provider 应启用[客户端签名](client-signature.md)。
