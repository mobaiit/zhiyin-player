# 连接配置与认证

连接配置描述客户端如何向 Provider 的 `authenticate` 端点提交不透明凭据。它不是发现文件的一部分，客户端不解释其中的业务含义。

```json
{
  "url": "https://provider.example?key=opaque-value",
  "headers": {
    "Authorization": "Bearer opaque-value",
    "X-Provider-Key": "opaque-value"
  },
  "credentials": "omit"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `url` | 是 | HTTPS 地址，不得包含用户名或密码。查询参数只附加到 `authenticate` 请求。 |
| `headers` | 否 | 只附加到 `authenticate` 请求的静态 Header，最多 20 个，单个值不超过 2048 个字符且不得包含换行。 |
| `credentials` | 否 | 浏览器客户端的 Cookie 策略：`omit`、`same-origin` 或 `include`，默认 `omit`。服务端客户端（如知音）忽略此字段。 |

客户端拒绝以下 Header：`Cookie`、`Host`、`Origin`、`Referer`、`User-Agent`、`Content-Length`、`Connection`，以及以 `Sec-`、`Proxy-` 开头的 Header。

知音后端发出所有协议请求，浏览器的 Cookie 不会被转发给 Provider。Provider 如果需要同时支持服务端客户端，应通过 URL 参数或 Header 接收凭据，不要只依赖 Cookie。

## 客户端必须

- 公开读取发现文件，不携带连接凭据；
- 只在 `authenticate` 请求中保留 `url` 查询参数并附加静态 Header；
- 在 `authenticate` 请求体中传递 `clientAccount`；
- 认证成功后，只使用 Provider 返回的短期 Bearer Token 请求其他协议端点，不得把原始连接凭据附加到其他请求；
- 不解析、不转换、不刷新任何配置值；
- 加密保存连接配置。

## 认证请求

```http
POST /v1/auth/authenticate?key=opaque-value
Content-Type: application/json
X-Provider-Key: opaque-value
```

```json
{
  "clientAccount": {
    "id": "local-account-id",
    "name": "Display name",
    "email": "user@example.com"
  }
}
```

| 字段 | 说明 |
|---|---|
| `clientAccount.id` | 客户端内部的账号 ID，最多 100 个字符。 |
| `clientAccount.name` | 账号显示名称，最多 80 个字符，可以为空。 |
| `clientAccount.email` | 去除首尾空格并转为小写的邮箱，最多 160 个字符。它是账号的唯一凭证，Provider 可以用它把连接凭据绑定到一个账号。 |

## 认证响应

```json
{
  "accessToken": "short-lived-token",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "account": {
    "status": "active",
    "expiresAt": "2027-10-20T12:00:00.000Z"
  },
  "presentation": {
    "title": "服务状态",
    "badge": { "text": "可用", "tone": "positive" },
    "items": [{ "label": "有效时间", "value": "2027-10-20T12:00:00.000Z" }]
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `accessToken` | 是 | 短期令牌，客户端在其他请求中以 `Authorization: Bearer <token>` 发送。 |
| `tokenType` | 是 | 1.0 固定为 `Bearer`。 |
| `expiresIn` | 是 | 令牌有效秒数。客户端把小于 30 的值按 30 处理，缺失或无效时按 900 处理。 |
| `account.status` | 否 | 当前连接的服务状态，例如 `active`。 |
| `account.expiresAt` | 否 | ISO 8601 时间，表示服务到期时间。客户端用它显示服务剩余时长；没有期限时省略。 |
| `presentation` | 否 | 纯文本展示区块，结构见[发现与校验](discovery.md)。 |

`account` 是机器可读的服务信息，`presentation` 只用于展示。客户端判断服务到期时间时只读取 `account.expiresAt`，不从 `presentation` 中解析日期。

## 令牌的使用和刷新

- 客户端按用户和 Provider 配置分别缓存令牌，在到期前 15 秒停止使用。
- 令牌到期后，客户端重新读取发现文件并再次调用 `authenticate`，协议 1.0 没有单独的刷新端点。
- 任何协议请求返回 401 或 403 时，客户端丢弃当前令牌，下一次请求会重新认证。

因此同一连接凭据和同一账号会被反复认证，大约每 15 分钟一次。Provider 必须保证 `authenticate` 对同一凭据和同一 `clientAccount.email` 是幂等的：重复认证返回新的令牌，不改变服务到期时间，也不重复消耗凭据。同一凭据被其他邮箱使用时，返回 409 `connection_credential_bound`。

## 职责边界

Provider 可以使用 URL、Header 或其组合作为认证依据，具体验证规则由 Provider 服务端决定。

高级 JSON 配置必须符合上述结构，不允许脚本、动态表达式、请求钩子或自定义签名代码。需要动态签名的服务应在 Provider 服务端完成签名，向客户端暴露普通的 MPP 入口。Provider 与客户端之间的签名见[客户端签名](client-signature.md)，它由客户端软件实现，不属于用户的连接配置。
