# 客户端签名（可选）

用户凭证只能证明是哪个用户在使用 Provider，无法证明请求来自哪个客户端软件。Provider 如果只想让自己认可的客户端（例如知音后端）调用，可以要求客户端对每个协议请求签名。这样即使用户凭证或访问令牌泄露，未登记的服务端也无法调用。

签名是协议 1.0 的可选扩展。不要求签名的 Provider 忽略这些请求头即可，现有客户端不受影响。

## 声明

Provider 在发现文件中声明：

```json
{
  "clientAuthentication": {
    "type": "hmac-sha256",
    "required": true
  }
}
```

- `type`：1.0 只有 `hmac-sha256`。
- `required`：为 `true` 时，未签名或签名无效的协议请求会被拒绝；为 `false` 时 Provider 接受签名，但暂不强制。

客户端只要为该 Provider 配置了客户端密钥，就对所有请求签名，不论 `required` 的值。

## 客户端密钥

Provider 为每个允许接入的客户端分配一组凭据：

- **Client ID**：公开标识，例如 `zhiyin`；
- **Secret**：至少 32 个字符的随机字符串。

两者只保存在客户端服务端，例如知音后台的加密数据库，绝不下发到浏览器，也不写进连接配置或源码。

## 签名规则

客户端在每个请求中加上三个请求头：

```http
X-Client-Id: zhiyin
X-Client-Timestamp: 1764230400
X-Client-Signature: 5f2b…（64 位小写十六进制）
```

签名内容由四行组成，以 `\n` 连接，末尾没有换行：

```text
{HTTP 方法，大写}
{路径和查询字符串，与实际请求完全一致}
{X-Client-Timestamp 的值}
{请求体 SHA-256 的小写十六进制；没有请求体时是空字符串的 SHA-256}
```

```text
X-Client-Signature = lowercaseHex(HMAC-SHA256(Secret, 签名内容))
```

示例：

```text
GET
/v1/catalog/search?q=%E6%9E%97&page=1
1764230400
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

- 路径和查询字符串取自客户端实际请求的 URL，保持原有编码和参数顺序，不做排序或重新编码。
- 请求体按实际发送的字节计算哈希，客户端签名后不得再修改请求体。
- `X-Client-Timestamp` 是 Unix 时间，单位秒。

JavaScript 示例：

```js
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
async function signedHeaders(method, url, body, clientId, secret) {
  const encoder = new TextEncoder();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const target = new URL(url);
  const bodyHash = hex(await crypto.subtle.digest('SHA-256', encoder.encode(body || '')));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const content = [method.toUpperCase(), `${target.pathname}${target.search}`, timestamp, bodyHash].join('\n');
  return { 'X-Client-Id': clientId, 'X-Client-Timestamp': timestamp, 'X-Client-Signature': hex(await crypto.subtle.sign('HMAC', key, encoder.encode(content))) };
}
```

## Provider 校验

Provider 收到请求后依次检查：

1. Client ID 存在且已启用；
2. 时间戳与服务器时间相差不超过 300 秒；
3. 按同样规则计算的签名与请求头一致，使用常量时间比较；
4. 该客户端被允许访问当前接口。

签名覆盖除发现文件外的所有协议端点，包括 `authenticate`。`health`、`terms`、`privacy` 可以保持公开。

| 情况 | 状态码 | 错误码 |
|---|---|---|
| 要求签名但缺少签名请求头 | 401 | `client_authentication_required` |
| Client ID 不存在、签名错误或时间戳超出范围 | 401 | `client_authentication_failed` |
| 客户端已停用或无权访问该接口 | 403 | `client_forbidden` |

客户端收到这些错误时不应重新认证用户，也不应重试，因为问题出在客户端密钥配置上，重试不会改变结果。

## 浏览器客户端

浏览器无法安全保存 Secret，所以不能使用签名。Provider 可以另外按 `Origin` 请求头允许指定网页调用，但这只能限制浏览器中的网页：浏览器以外的程序可以伪造 `Origin`。要求强限制的 Provider 应只接受签名请求。
