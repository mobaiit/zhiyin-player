# 目录和单曲接口

所有接口都需要 `Authorization: Bearer <accessToken>`。Provider 要求[客户端签名](client-signature.md)时，还需要签名请求头。

## 统一 Track 模型

搜索、随机推荐、榜单、歌单、收藏、播放队列以及所有单曲接口使用同一组歌曲字段：

```json
{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "title": "Track title",
  "artist": "Artist",
  "album": "Album",
  "duration": 240,
  "art": "https://provider.example/artwork/track-001",
  "binding": {
    "source": "example",
    "sourceId": "track-001",
    "meta": {},
    "art": "https://provider.example/artwork/track-001"
  }
}
```

- `songId`、`title`、`artist`、`album` 和 `binding` 必填。`album` 未知时必须传空字符串，不得省略。
- `songId` 必须按[歌曲身份规则](identity.md)生成。协议不使用 `id` 表示歌曲身份。
- `duration` 为可选的音频秒数；`art` 为可选的当前展示封面 URL。
- Track 顶层不得重复返回 `source` 或 `sourceId`，资源定位信息只存在于 `binding`。
- 榜单 Track 可以额外包含从 1 开始的 `rank`。

客户端收到 Track 后会按 `title` 和 `artist` 重新计算 `songId`，丢弃缺少 `binding` 的 Track，并按 `songId` 去重。

## Binding 模型

`binding` 在 Track 和所有单曲请求中强制必填，固定结构为：

```json
{
  "source": "netease",
  "sourceId": "1901371647",
  "meta": {},
  "art": ""
}
```

- `source`：必填、非空字符串，标识歌曲所在的音乐平台或 API 服务。
- `sourceId`：必填、非空字符串，是该 `source` 内部的歌曲标识；客户端将其视为不透明字符串，不执行数值转换或格式改写。
- `meta`：必填 JSON object，可以为空对象；不得为数组、字符串、数字或 `null`。Provider 自行定义内部字段，客户端不解释内容并在后续请求中原样回传。
- `art`：必填字符串，可以为空。它是该绑定携带的封面资源提示，Provider 的封面解析无法产生新地址时可以回退使用。它不参与歌曲身份或 binding 唯一性判断。

`songId` 用于缓存、收藏和跨 Provider 去重；`binding` 只描述当前已知的上游资源位置。切换 Provider 后，客户端继续传递现有 binding；Provider 可以直接使用能够识别的 binding，也可以根据原始 `title`、`artist` 和 `album` 重新检索，并在响应中返回替换后的 binding。

## 目录接口

### 搜索

`GET /v1/catalog/search?q=&page=&limit=`

| 参数 | 必填 | 说明 |
|---|---|---|
| `q` | 是 | 关键词。 |
| `page` | 否 | 从 1 开始，默认 1。 |
| `limit` | 否 | 每页数量，Provider 决定默认值和上限。 |

返回 `{ tracks, page, hasMore }`。无结果时 `tracks` 为空数组。Provider 可以限制关键词长度和最大页数，超出时返回 400 `invalid_request`。

### 随机推荐

`GET /v1/catalog/random?exclude=&era=&languages=`

| 参数 | 必填 | 说明 |
|---|---|---|
| `exclude` | 否 | 逗号分隔、逐项 URL 编码的近期艺人列表，Provider 尽量避开这些艺人。 |
| `era` | 否 | `new`（新歌优先）、`any` 或 `classic`（经典老歌）。 |
| `languages` | 否 | 逗号分隔的 `zh`、`en`、`jk`、`yue`、`instrumental`，表示优先的语言；不传表示不限。 |

返回一批歌曲：

```json
{
  "tracks": [],
  "singer": "",
  "playlist": {},
  "playlists": []
}
```

- `tracks` 必填。
- `singer`、`playlist`、`playlists` 可选，说明这批歌曲来自哪位歌手或哪些歌单，结构由 Provider 定义。客户端只做记录，不依赖它们。

`era` 和 `languages` 是偏好提示，Provider 可以忽略不支持的值。客户端按批次播放：先播完本批未播放的歌曲，播到最后一首时预取下一批。

### 榜单

`GET /v1/catalog/charts?platform=&chart=&refresh=`

返回：

```json
{
  "platform": "netease",
  "chart": "rising",
  "title": "网易云音乐飙升榜",
  "updatedAt": "2026-11-27T08:00:00.000Z",
  "stale": false,
  "tracks": []
}
```

- 平台和榜单标识由 Provider 定义。知音使用 `platform` 为 `netease` 或 `qq`，`chart` 为 `rising`、`new`、`original` 或 `hot`。
- `refresh=1` 表示用户主动刷新，Provider 可以限制强制刷新频率。
- `stale: true` 表示本次刷新失败，返回的是上一次成功的数据。
- 客户端按 Provider 配置、平台和榜单类型分别缓存成功响应，刷新失败时必须保留旧缓存。

### 精选歌单

`GET /v1/catalog/playlists?platform=&category=&cursor=`：返回一页歌单。

```json
{
  "platform": "netease",
  "category": "recommend",
  "categories": [{ "id": "recommend", "name": "推荐" }],
  "playlists": [
    { "id": "123", "name": "歌单名称", "cover": "https://…", "trackCount": 50, "plays": 1000000, "description": "" }
  ],
  "nextCursor": "18"
}
```

- `category` 可选，取值来自响应中的 `categories`，默认是 Provider 定义的推荐分类。
- 把 `nextCursor` 作为 `cursor` 传回即可取下一页；为 `null` 时没有更多。
- `trackCount` 未知时为 0。

`GET /v1/catalog/playlists?platform=&id=`：返回一个歌单的详情 `{ platform, id, name, cover, description, tracks }`。

`platform` 和歌单 `id` 的格式由 Provider 定义。知音使用 `netease` 或 `qq`，歌单 `id` 是平台的数字编号。

## 单曲接口

单曲接口必须收到完整的歌曲上下文：`songId`、原始 `title` 和 `artist`、原始 `album`（未知时为空字符串）和完整 `binding`，且与 Track 原样一致。

### 解析播放地址

`POST /v1/tracks/resolve`

```json
{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "title": "Track title",
  "artist": "Artist",
  "album": "Album",
  "binding": { "source": "example", "sourceId": "track-001", "meta": {}, "art": "" },
  "quality": "320k",
  "refresh": "url"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `quality` | 否 | 期望音质，见[能力与播放](capabilities.md)。 |
| `refresh` | 否 | `url`：地址或网络失败，绕过 Provider 缓存重新解析；`decode`：浏览器无法解码，绕过缓存并从请求音质的下一档开始降级。不传表示普通请求。 |

成功响应：

```json
{
  "songId": "2725dfd72d4bdd075e2ddaebc49c7224",
  "url": "https://media.example/track.mp3",
  "binding": { "source": "example", "sourceId": "track-001", "meta": {}, "art": "" },
  "requestedQuality": "320k",
  "quality": "320k",
  "bitrate": 320,
  "degraded": false,
  "qualityVerified": true,
  "expiresIn": 1800,
  "expiresAt": "2026-11-27T08:30:00.000Z"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `songId` | 是 | 与请求一致。 |
| `url` | 是 | 非空时可尝试播放；空字符串表示本次没有取得播放资源。 |
| `binding` | 是 | 实际使用或更新后的 binding，客户端会用它替换本地记录。 |
| `expiresAt` | 推荐 | 播放地址的绝对到期时间，优先级高于 `expiresIn`。 |
| `expiresIn` | 是 | 有效秒数，`url` 为空时为 0。 |
| `requestedQuality` | 否 | 客户端请求的音质。 |
| `quality` | 否 | 实际解析的音质，没有时为 `null`。 |
| `bitrate` | 否 | 实际码率，单位 kbps。 |
| `degraded` | 否 | 实际音质是否低于请求音质。 |
| `qualityVerified` | 否 | 音质是否由上游码率信息确认。 |

上游没有提供有效期时，Provider 和客户端统一按 30 分钟处理。Provider 可以返回其他诊断字段，客户端忽略它们。

解析失败时推荐返回标准错误结构，让客户端直接切歌，不做无意义的重试：

| 错误码 | 推荐状态码 | 含义 |
|---|---|---|
| `no_candidate` | 404 | 没有找到任何可用的资源绑定。 |
| `all_resolvers_failed` | 502 | 找到了候选资源，但全部解析失败。 |
| `quality_unavailable` | 502 | 请求音质及允许的降级音质都不可用。 |
| `upstream_timeout` | 504 | 上游超时。 |

为兼容简单 Provider，HTTP 200 且 `url: ""` 也表示本次没有取得播放地址。

### 播放失败后的重试

客户端对同一首歌的重试顺序：

1. 首次普通请求；
2. 地址加载失败后，清除本地缓存，再发一次普通请求，以复用其他客户端可能已更新的 Provider 缓存；
3. 仍然失败时，发送 `refresh: "url"`；
4. 浏览器报告无法解码时，发送 `refresh: "decode"`；
5. 仍然失败则切换到下一首。

刷新请求的 `quality` 始终使用用户当前设置，不使用缓存响应中的实际音质。Provider 不可达（超时、5xx、网络错误）时，客户端只额外重试一次。播放列表连续 8 首无法播放时，客户端停止并提示用户。客户端必须限制重试次数，禁止无限重试。

### 歌词

`GET /v1/tracks/{songId}/lyrics?title=&artist=&album=&binding=`

- `album` 即使为空也必须出现在查询参数中；
- `binding` 是完整 Binding 经 `JSON.stringify` 后，再由 `URLSearchParams` 编码的字符串。

返回 `{ songId, lyrics, translation?, binding }`：

- 没有歌词时 `lyrics` 为空字符串；
- `translation` 是可选的翻译歌词，建议与 `lyrics` 使用相同时间轴；
- 无法绑定到平台资源的外部歌词回退允许 `binding: null`。

### 封面

`GET /v1/tracks/{songId}/artwork?title=&artist=&album=&binding=&refresh=`

返回 `{ songId, url, binding }`，没有封面时 `url` 为空字符串。`refresh=1` 表示客户端加载封面失败，请 Provider 重新查找；Provider 可以忽略。

空歌词和空封面表示当前没有资源，不触发音频播放重试。

## 超时

客户端对每个 Provider 请求设置 60 秒超时。Provider 应在超时前返回结果或明确的错误响应。
