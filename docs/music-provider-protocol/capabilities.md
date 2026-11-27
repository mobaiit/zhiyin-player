# 能力与播放

| 能力 | 对应端点 | 说明 |
|---|---|---|
| `search` | `search` | 关键词搜索 |
| `random` | `random` | 按偏好返回一批推荐歌曲 |
| `charts` | `charts` | 平台榜单 |
| `playlists` | `playlists` | 精选歌单列表和歌单详情 |
| `lyrics` | `lyrics` | 单曲歌词 |
| `artwork` | `artwork` | 单曲封面 |
| `playback` | `resolve` | 解析播放地址，必须同时声明 `playback.mode` |
| `qualities` | 无 | 支持按音质解析，必须同时声明 `playback.qualities` |

Provider 只能声明已经实现并提供对应端点的能力，客户端只显示当前 Provider 声明的功能。客户端忽略不认识的能力。

## 播放模式

1.0 只支持 `direct` 模式：

- `resolve` 返回短期 HTTPS 音频地址；
- 音频由浏览器直接访问，不经过客户端后端；
- 地址可以为空字符串，表示本次没有取得可播放资源；
- 非空地址建议支持 Range 请求，方便拖动进度。

## 音质

标准音质标识：`128k`、`192k`、`320k`、`flac`、`flac24bit`。Provider 可以只支持其中一部分，并在 `playback.qualities` 中列出。请求的音质不可用时，Provider 按从高到低的顺序降级，并在响应中报告实际音质，见[目录接口](catalog.md)中的 `resolve`。

## 客户端缓存

客户端可以按 Provider 配置隔离播放队列、榜单和短期资源缓存。知音的做法：

- 播放结果按 `songId` 只保留最新一条非空结果，在 `expiresAt` 之前直接复用；没有有效期的结果不缓存；
- 当前歌曲开始播放后，提前解析下一首的播放地址；
- 非空的歌词和封面按 `songId` 缓存 1 小时，空结果不缓存；
- 榜单按 Provider、平台和榜单分别缓存 24 小时，刷新失败时保留旧数据。

Provider 的数据源、解析策略、缓存策略和内部存储不属于协议范围。所有 Provider 请求的客户端超时为 60 秒。
