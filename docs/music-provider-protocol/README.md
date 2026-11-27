# Music Provider Protocol 1.0

Music Provider Protocol（MPP）是知音与独立音乐 Provider 之间的开放 JSON/HTTPS 协议。它规定客户端如何发现 Provider、换取访问令牌、发送请求以及解释响应，不规定 Provider 如何验证连接凭据、管理用户或组织自身业务。

客户端不加载远程 JavaScript，也不理解连接配置中 URL 参数和 Header 的业务含义。官方 Provider 与第三方 Provider 使用同一协议，区别只在于连接配置由系统预置还是由用户提供。

## 交互模型

知音采用服务端客户端模型：

```text
浏览器 ──> 知音后端 ──> Provider 协议端点
浏览器 ──────────────> 播放 URL、封面 URL
```

- 发现、认证、目录、播放解析、歌词和封面请求全部由知音后端发出，浏览器不直接访问 Provider 协议端点。
- 只有 Provider 返回的播放地址和封面地址由浏览器直接加载。
- 客户端为每个用户和 Provider 配置分别缓存短期访问令牌，令牌到期或被拒绝后重新调用 `authenticate`。

其他客户端也可以在浏览器中直接实现本协议。两种模型使用同一套请求和响应格式，差异见[错误、CORS 与安全](security.md)。

## 协议模块

- [发现与校验](discovery.md)
- [连接配置与认证](authentication.md)
- [客户端签名（可选）](client-signature.md)
- [能力与播放](capabilities.md)
- [歌曲身份规则](identity.md)
- [目录接口](catalog.md)
- [错误、CORS 与安全](security.md)
- [隐私与版本](privacy.md)

面向用户和开发者的网页文档位于 `https://zhiyin.us.ci/docs`。

发现入口为 `/.well-known/music-provider.json`。Provider 必须声明协议版本、能力、播放模式和端点，也可以返回一个可选的纯文本展示区块。1.0 客户端必须忽略未知字段。

Provider 地址、Header 值、连接凭据和客户端密钥都属于具体部署的配置，不属于协议文档，也不得写入客户端源码。
