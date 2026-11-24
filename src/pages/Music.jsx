import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmDialog, Toast } from '../luri-music/UiFeedback';
import { SINGERS } from '../data/singers';
import { songIdFor } from '../../shared/song-identity';
import PlayerTitle from '../components/PlayerTitle';
import { activateOverlayFocus } from '../components/useOverlayFocus';
import { getTheme, setTheme, subscribeToTheme } from '../components/theme';
import useMusicLibrary from '../luri-music/useMusicLibrary';
import { LOGIN_REQUIRED, sessionExpired } from '../luri-music/session';
import './Music.css';
import './MusicQ.css';

// An expired login is handled by the account shell (it asks to sign in again), so it is never
// reported as the Provider refusing access.
const loginExpired = (error) => error?.code === LOGIN_REQUIRED;
const providerDenied = (error) => !loginExpired(error) && (error?.code === 'provider_access_denied' || error?.status === 401 || error?.status === 403);
const EMPTY_ART = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"%3E%3Crect width="400" height="400" fill="%23ece9e1"/%3E%3Ccircle cx="200" cy="200" r="106" fill="%23c8c2b7"/%3E%3Ccircle cx="200" cy="200" r="22" fill="%23111111"/%3E%3C/svg%3E';
const TEXT = { title: '\u97f3\u4e50', discover: '\u53d1\u73b0\u97f3\u4e50', likes: '\u6211\u7684\u559c\u6b22', search: '\u641c\u7d22', searchHint: '\u641c\u7d22\u6b4c\u66f2\u3001\u827a\u4eba\u6216\u4e13\u8f91', searching: '\u6b63\u5728\u641c\u7d22\u2026', queue: '\u64ad\u653e\u961f\u5217', tracks: '\u9996\u6b4c\u66f2', noResult: '\u6682\u65e0\u641c\u7d22\u7ed3\u679c', noTrack: '\u6682\u65e0\u6b4c\u66f2', choose: '\u8bf7\u641c\u7d22\u540e\u9009\u62e9\u6b4c\u66f2', now: '\u6b63\u5728\u64ad\u653e', play: '\u64ad\u653e', pause: '\u6682\u505c', prev: '\u4e0a\u4e00\u9996', next: '\u4e0b\u4e00\u9996', load: '\u6b63\u5728\u83b7\u53d6\u53ef\u64ad\u653e\u6587\u4ef6\u2026', unavailable: '\u6ca1\u6709\u627e\u5230\u53ef\u76f4\u64ad\u7684\u97f3\u9891\u6587\u4ef6', source: '\u516c\u5f00\u97f3\u9891\u76ee\u5f55', disclaimer: '\u672c\u9875\u4ec5\u63d0\u4f9b\u641c\u7d22\u4e0e\u64ad\u653e\u754c\u9762\uff0c\u4e0d\u6258\u7ba1\u3001\u4e0d\u590d\u5236\u3001\u4e0d\u4ee3\u7406\u4efb\u4f55\u97f3\u9891\u6587\u4ef6\u3002\u8bf7\u4ec5\u4f7f\u7528\u5df2\u83b7\u6388\u6743\u7684\u97f3\u6e90\uff0c\u5e76\u9075\u5b88\u5176\u670d\u52a1\u6761\u6b3e\u4e0e\u9002\u7528\u6cd5\u5f8b\u3002' };
const time = (value = 0) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
const lyricLine = (line) => { const matches = [...line.matchAll(/\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/g)]; const text = line.replace(/\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]/g, '').trim(); return matches.length ? matches.map((match) => ({ time: Number(match[1]) * 60 + Number(match[2]), text })) : [{ time: -1, text: line }]; };
const parsedLyrics = (value) => String(value || '').split(/\r?\n/).filter(Boolean).flatMap(lyricLine).filter((line) => line.text);
const STORE_QUEUE = 'luri.music.queue.v3'; const STORE_LIKES = 'luri.music.likes.v3'; const STORE_SEARCH = 'luri.music.search.v3'; const STORE_QUERY = 'luri.music.query.v3'; const STORE_RECENT_SEARCHES = 'luri.music.recent-searches.v3'; const STORE_RANDOM_LIST = 'luri.music.random-list.v1'; const STORE_PLAYBACK_MODE = 'luri.music.playback-mode.v1';
const STORE_SONG_CACHE = 'luri.music.songs.v1'; const SONG_CACHE_LIMIT = 500;
const STORE_CHART = 'luri.music.chart.v3';
const PLAYBACK_MODES = ['sequence', 'shuffle', 'repeat-one'];
const PLAYBACK_MODE_META = {
  sequence: { label: '顺序播放', icon: 'sequence' },
  shuffle: { label: '随机播放', icon: 'random' },
  'repeat-one': { label: '单曲循环', icon: 'repeat-one' },
};
const CHART_TYPES = [{ value: 'rising', label: '飙升榜' }, { value: 'new', label: '新歌榜' }, { value: 'original', label: '原创榜' }, { value: 'hot', label: '热歌榜' }];
const CHART_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MEDIA_LOAD_TIMEOUT_MS = 20000;
const RANDOM_TRACK_BUDGET_MS = 25000;
// The home 最近发现 grid shows two full rows: 6 columns on desktop, 2 on phones.
const HOME_DISCOVERED_DESKTOP = 12;
const HOME_DISCOVERED_PHONE = 8;
// Random play stops after this many songs in a row fail, instead of requesting batches forever.
const RANDOM_FAILURE_LIMIT = 10;
const MIN_PLAYABLE_DURATION_SECONDS = 20;
const FAVORITES_SYNC_DEBOUNCE_MS = 30 * 1000;
const FAVORITES_WRITE_INTERVAL_MS = 60 * 60 * 1000;
const FAVORITES_SYNC_RETRY_MS = 30 * 1000;
const canonicalBinding = (value) => value && typeof value === 'object' && !Array.isArray(value) && typeof value.source === 'string' && value.source && typeof value.sourceId === 'string' && value.sourceId && value.meta && typeof value.meta === 'object' && !Array.isArray(value.meta) && typeof value.art === 'string'
  ? { source: String(value.source), sourceId: String(value.sourceId), meta: value.meta, art: String(value.art || ''), ...(typeof value.resolver === 'string' && value.resolver.trim() ? { resolver: value.resolver.trim() } : {}) }
  : null;
let songCacheMemory;
const songCache = () => {
  if (songCacheMemory) return songCacheMemory;
  try { const value = JSON.parse(localStorage.getItem(STORE_SONG_CACHE) || '{}'); songCacheMemory = value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { songCacheMemory = {}; }
  return songCacheMemory;
};
const rememberSong = (track) => {
  const binding = canonicalBinding(track?.binding); const title = String(track?.title || ''); const artist = String(track?.artist || '');
  if (!binding || !title || !artist) return;
  const songId = songIdFor(title, artist); const cache = songCache();
  const art = String(track?.art || '') || String(cache[songId]?.art || '');
  cache[songId] = { songId, title, artist, album: String(track?.album || ''), binding, art, updatedAt: Date.now() };
  const entries = Object.entries(cache);
  if (entries.length > SONG_CACHE_LIMIT) entries.sort((left, right) => Number(right[1]?.updatedAt || 0) - Number(left[1]?.updatedAt || 0)).slice(SONG_CACHE_LIMIT).forEach(([key]) => delete cache[key]);
  try { localStorage.setItem(STORE_SONG_CACHE, JSON.stringify(cache)); } catch { /* Storage is unavailable in private browsing. */ }
};
const canonicalTrack = (track) => {
  const title = String(track?.title || ''); const artist = String(track?.artist || ''); const local = track?.sourceType === 'local'; const songId = local && track?.songId ? String(track.songId) : songIdFor(title, artist); const cached = local ? null : songCache()[songId]; const binding = canonicalBinding(cached?.binding) || canonicalBinding(track?.binding); const art = String(track?.art || '') || String(cached?.art || '');
  if (!title || !artist || !binding) return null;
  const { id: _legacyId, source: _legacySource, sourceId: _legacySourceId, ...fields } = track;
  return { ...fields, songId, title, artist, album: String(track?.album || ''), binding, art };
};
const canonicalTracks = (items) => { const seen = new Set(); return (Array.isArray(items) ? items : []).flatMap((item) => { const track = canonicalTrack(item); if (!track || seen.has(track.songId)) return []; seen.add(track.songId); return [track]; }); };
const readStore = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const readPlaybackMode = () => { try { const value = localStorage.getItem(STORE_PLAYBACK_MODE); return PLAYBACK_MODES.includes(value) ? value : 'sequence'; } catch { return 'sequence'; } };
const readTrackStore = (key) => canonicalTracks(readStore(key));
const readSession = (key) => { try { return JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { return {}; } };
const writeSession = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Session storage may be unavailable. */ } };
const randomTextKey = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s()（）.·_-]/g, '');
const randomTrackKey = (track) => `${randomTextKey(track?.title)}:${randomTextKey(track?.artist)}`;
const shuffled = (items) => {
  const values = [...items];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
};
const trackArtists = (track) => String(track?.artist || '').split(/\s*(?:,|，|、|\/|&|feat\.?|ft\.?)\s*/i).filter(Boolean);
const sameFavorite = (left, right) => Boolean(left?.songId && right?.songId && left.songId === right.songId);
const samePlaylistTrack = (left, right) => Boolean(left?.title && left?.artist && right?.title && right?.artist && songIdFor(left.title, left.artist) === songIdFor(right.title, right.artist));
const chartStoreKey = (platform, chart) => `${STORE_CHART}.${platform}.${chart}`;
const readChartStore = (platform, chart) => { try { return JSON.parse(localStorage.getItem(chartStoreKey(platform, chart)) || 'null'); } catch { return null; } };
const hydrateChart = (payload) => ({ ...payload, tracks: canonicalTracks(payload?.tracks).map((track, index) => ({ ...track, rank: Number(track.rank) || index + 1 })) });
const chartUpdatedLabel = (value) => { const timestamp = Date.parse(value || ''); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp) : '暂无缓存'; };
// Only Provider artwork URLs are worth storing and syncing; data: and blob: URLs are device-local.
const storableArt = (value) => /^https?:\/\//i.test(String(value || '')) ? String(value).slice(0, 2000) : '';
// A bare path such as "120/a.jpg" would be requested from this site; only absolute URLs can be covers.
const usableArt = (value) => { const url = String(value || ''); return url !== EMPTY_ART && /^(?:https?:\/\/|data:image\/|blob:)/i.test(url) ? url : ''; };
// Artwork known on this device: the track itself, the song cache, then the binding hint.
const artworkFor = (track) => {
  if (!track) return '';
  if (track.sourceType === 'local') return usableArt(track.art);
  return usableArt(track.art) || usableArt(songCache()[track.songId]?.art) || usableArt(track.binding?.art);
};
const minimalFavorites = (items) => canonicalTracks(items).map((track) => ({ songId: track.songId, title: track.title, artist: track.artist, album: track.album, art: storableArt(artworkFor(track)), binding: track.binding }));
const resolvedExpiry = (payload) => { const explicit = Date.parse(payload?.expiresAt || ''); if (Number.isFinite(explicit)) return new Date(explicit).toISOString(); const seconds = Number(payload?.expiresIn); return Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null; };
const playbackUrlExpired = (track) => { if (track?.sourceType === 'local') return false; const expires = Date.parse(track?.expiresAt || ''); return Boolean(track?.url && (!Number.isFinite(expires) || expires <= Date.now() + 5000)); };
const providerPayload = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const detail = payload?.error && typeof payload.error === 'object' ? payload.error : {};
  const failure = new Error(detail.message || payload.error || 'Provider 请求失败');
  failure.code = detail.code || 'provider_request_failed'; failure.status = response.status;
  throw failure;
};
const singerSearchKey = (value) => String(value || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
// The source status is shown only while an operation is in progress.
TEXT.source = '';
TEXT.unavailable = '加载失败，请重新播放';

function MusicIcon({ name }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="5.5" /><path d="m15.2 15.2 4 4" /></>,
    play: <path d="m9 6 8 6-8 6Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M9 6v12M15 6v12" /></>,
    previous: <><path d="M7 6v12" /><path d="m17 6-7 6 7 6Z" fill="currentColor" stroke="none" /></>,
    next: <><path d="M17 6v12" /><path d="m7 6 7 6-7 6Z" fill="currentColor" stroke="none" /></>,
    volume: <><path d="M5 10h3l4-3v10l-4-3H5Z" fill="currentColor" stroke="none" /><path d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.7a7.4 7.4 0 0 1 0 10.6" /></>,
    mute: <><path d="M5 10h3l4-3v10l-4-3H5Z" fill="currentColor" stroke="none" /><path d="m16 10 4 4m0-4-4 4" /></>,
    download: <><path d="M12 4v11m-4-4 4 4 4-4" /><path d="M5 19h14" /></>,
    link: <><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></>,
    random: <><path d="M4 7h3l10 10h3" /><path d="m17 5 3 2-3 2" /><path d="M4 17h3l2.2-2.2M14.8 9.2 17 7h3" /></>,
    sequence: <><path d="M5 7h14M5 12h11M5 17h8" /><path d="m16 15 3 2-3 2" /></>,
    'repeat-one': <><path d="M17 7h1a3 3 0 0 1 3 3v3M7 17H6a3 3 0 0 1-3-3v-3" /><path d="m17 4 3 3-3 3M7 20l-3-3 3-3" /><path d="M12 9v6" /></>,
    close: <><path d="m8 8 8 8M16 8l-8 8" /></>,
    heart: <path d="M12 20.2 4.6 13A4.8 4.8 0 0 1 11.4 6.2l.6.7.6-.7A4.8 4.8 0 0 1 19.4 13Z" />,
    back: <><path d="m14.5 6-6 6 6 6" /><path d="M9 12h10" /></>,
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v9h11v-9M10 19v-5h4v5" /></>,
    chart: <><path d="M5 19V9M12 19V5M19 19v-7" /></>,
    playlist: <><path d="M5 7h10M5 12h10M5 17h7" /><path d="M18 13v6m-3-3h6" /></>,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    folder: <><path d="M3.5 7.5h6l2-2h9v13h-17Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9L2.4 6.2l.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7Z" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.2c-.9.5-1.3 1-1.3 2M12 17h.01" /></>,
    disc: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 6.5a5.5 5.5 0 0 0-5.5 5.5" /></>,
    queue: <><path d="M5 7h12M5 12h9M5 17h6" /><path d="m17 14 3 3-3 3" /></>,
  };
  return <svg className="music-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

// Every cover falls back to the default artwork when its URL is missing or fails to
// load, so browsers never show a broken-image icon. A new URL is always tried again.
// With onUnavailable, a missing or unusable URL is reported once the cover scrolls
// near the viewport, so a long list only asks for covers the user can see.
function Artwork({ src, onError, onUnavailable, className = '', ...props }) {
  const [failed, setFailed] = useState('');
  const imageRef = useRef(null);
  const url = usableArt(src) && src !== failed ? src : EMPTY_ART;
  const unavailable = !usableArt(src);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => { onUnavailableRef.current = onUnavailable; });
  const watching = Boolean(onUnavailable) && unavailable;
  useEffect(() => {
    const image = imageRef.current;
    if (!watching || !image) return undefined;
    if (typeof IntersectionObserver === 'undefined') { onUnavailableRef.current?.(); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); onUnavailableRef.current?.();
    }, { rootMargin: '200px 0px' });
    observer.observe(image);
    return () => observer.disconnect();
  }, [watching, src]);
  return <img {...props} ref={imageRef} className={`music-artwork${className ? ` ${className}` : ''}`} src={url} alt="" onError={(event) => { if (url === EMPTY_ART) return; setFailed(url); onError?.(event); }} />;
}

// Lists grow with their rows; the scrolling happens on an ancestor (.music-app-page today).
const scrollParentOf = (element) => {
  for (let node = element?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
};

const QUALITY_META = {
  '128k': { label: '普通 128K', icon: 'low', mark: 'STD' },
  '192k': { label: '标准 192K', icon: 'medium', mark: 'HQ' },
  '320k': { label: '高音质 320K', icon: 'high', mark: 'HQ+' },
  flac: { label: '无损 FLAC', icon: 'lossless', mark: 'SQ' },
  flac24bit: { label: 'Hi-Res', icon: 'hires', mark: 'Hi-Res' },
};
// Restarts the press animation, so every click, tap or media key visibly registers.
const pressFeedback = (button) => {
  if (!button) return;
  button.classList.remove('is-control-feedback');
  void button.offsetWidth;
  button.classList.add('is-control-feedback');
};
const SYNC_STATE_LABELS = { synced: '音乐库已同步', syncing: '正在同步音乐库…', pending: '有更改尚未同步，稍后自动重试', local: '' };
// Random play preferences are sent to the Provider as hints (era, languages) and synced with the library.
// 不限 comes first in both groups; the defaults stay 新歌优先 and 华语.
const RANDOM_ERA_OPTIONS = [['any', '不限'], ['new', '新歌优先'], ['classic', '经典老歌']];
const RANDOM_LANGUAGE_OPTIONS = [['zh', '华语'], ['en', '欧美'], ['jk', '日韩'], ['yue', '粤语'], ['instrumental', '纯音乐']];
const DEFAULT_RANDOM_PREFERENCES = { era: 'new', languages: ['zh'] };
// A missing value means the defaults; an empty language list means no language preference.
const readRandomPreferences = (value) => ({
  era: RANDOM_ERA_OPTIONS.some(([key]) => key === value?.era) ? value.era : DEFAULT_RANDOM_PREFERENCES.era,
  languages: Array.isArray(value?.languages) ? [...new Set(value.languages.filter((language) => RANDOM_LANGUAGE_OPTIONS.some(([key]) => key === language)))] : DEFAULT_RANDOM_PREFERENCES.languages,
});
const QUALITY_RANK = { '128k': 1, '192k': 2, '320k': 3, flac: 4, flac24bit: 5 };

function QualityBadge({ track, fallbackQuality = '' }) {
  if (!track || track.sourceType === 'local') return null;
  const requested = track.requestedQuality === 'auto' ? '320k' : track.requestedQuality || fallbackQuality;
  const quality = track.quality || requested;
  const meta = QUALITY_META[quality]; if (!meta) return null;
  const detail = track.quality ? track.qualityVerified ? '实际音质' : 'Provider 解析档位' : '当前请求音质';
  const degraded = QUALITY_RANK[quality] && QUALITY_RANK[requested] ? QUALITY_RANK[quality] < QUALITY_RANK[requested] : Boolean(track.degraded);
  return <i className={`music-quality music-quality--${meta.icon}${degraded ? ' is-degraded' : ''}`} title={`${detail}：${meta.label}${degraded ? '（已降级）' : ''}`} aria-label={`${detail} ${meta.label}${degraded ? '，已降级' : ''}`}><span className="music-quality__mark" aria-hidden="true">{meta.mark}</span>{degraded && <svg className="music-quality__degrade" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v7M3.25 6.25 6 9l2.75-2.75" /></svg>}</i>;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器未允许复制');
}

// Mobile browsers cannot download cross-origin audio, so the URL is copied with
// enough song context to stay identifiable once pasted elsewhere.
const playbackShareText = (track) => {
  const expires = Date.parse(track.expiresAt || '');
  return [
    `歌曲：${track.title}`,
    `歌手：${track.artist}`,
    track.album && `专辑：${track.album}`,
    QUALITY_META[track.quality] && `音质：${QUALITY_META[track.quality].label}`,
    Number.isFinite(expires) && `链接有效期至：${new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(expires)}`,
    `播放地址：${track.url}`,
  ].filter(Boolean).join('\n');
};

function DownloadButton({ track, notify }) {
  const href = track?.sourceType === 'local' ? '' : track?.url;
  const extension = track?.quality === 'flac' || track?.quality === 'flac24bit' ? 'flac' : 'mp3';
  const filename = `${String(track?.title || 'music').replace(/[\\/:*?"<>|]/g, '_')}.${extension}`;
  const copyPlaybackUrl = async () => {
    if (!href) { notify?.('播放 URL 尚未就绪', '请先播放当前歌曲，解析成功后再复制。', 'warning'); return; }
    try { await copyText(playbackShareText(track)); notify?.('已复制歌曲信息', '包含歌曲名、歌手和播放 URL，可粘贴到下载工具或备忘录。', 'success'); }
    catch (error) { notify?.('复制失败', error.message || '请检查浏览器剪贴板权限。', 'error'); }
  };
  const icon = <MusicIcon name="download" />;
  return <>
    {href ? <a className="music-download-button music-download-button--desktop" href={href} download={filename} target="_blank" rel="noreferrer" aria-label={`下载 ${track.title}`} title="直接打开 Provider 音频源">{icon}</a> : <button className="music-download-button music-download-button--desktop" type="button" disabled aria-label="暂无可下载的音频" title="播放地址加载后可下载">{icon}</button>}
    <button className="music-download-button music-download-button--mobile" type="button" disabled={!track || track.sourceType === 'local'} onClick={copyPlaybackUrl} aria-label={href ? '复制歌曲信息和播放 URL' : '播放地址尚未就绪'} title={href ? '复制歌曲信息和播放 URL' : '请先播放歌曲'}><MusicIcon name="link" /></button>
  </>;
}

const routeView = (path) => path === '/' ? 'random' : path === '/discover' ? 'discover' : path === '/charts' ? 'netease' : path === '/search' ? 'search' : path === '/favorites' ? 'likes' : path === '/playlists' ? 'playlists' : path?.startsWith('/playlists/') ? 'playlist' : path === '/history' ? 'history' : path === '/local' ? 'local' : path === '/settings' ? 'settings' : 'random';
const safeName = (value, fallback = '未命名歌单') => String(value || '').trim().slice(0, 60) || fallback;
const localTrackFromFile = (file, index = 0) => {
  const relativePath = file.webkitRelativePath || file.name;
  const title = file.name.replace(/\.[^.]+$/, '') || `本地歌曲 ${index + 1}`;
  return { songId: `local:${Date.now()}:${index}:${relativePath}`, sourceType: 'local', title, artist: '本地音乐', album: relativePath.includes('/') ? relativePath.split('/').slice(0, -1).join('/') : '本地文件', url: URL.createObjectURL(file), localUrl: true, art: '', binding: { source: 'local', sourceId: relativePath, meta: { size: file.size, type: file.type }, art: '' } };
};

export default function Music({ forceMusicPage = false, providerClient = null, playbackQuality = '128k', favoriteNamespace = '', favoriteBackup = [], favoriteBackupUpdatedAt = null, favoriteSyncEnabled = false, onRequireAccess, routePath = '/', onNavigate, user = null, activeProvider = null, accountBooting = false, docsEnabled = true, onOpenAuth, onOpenAnnouncement, onOpenSettings, onLogout, notify }) {
  const isMusicPage = forceMusicPage || window.location.pathname === '/music';
  const audio = useRef(null);
  const musicRequest = useCallback((kind, params = {}, signal) => {
    if (providerClient) return providerClient.request(kind, params, signal);
    const error = new Error('请先配置并启用 Provider');
    error.status = 403;
    error.code = 'provider_access_denied';
    return Promise.reject(error);
  }, [providerClient]);
  const likedStoreKey = `${STORE_LIKES}.${favoriteNamespace || 'guest'}`; const favoriteDirtyKey = `luri.music.likes-sync-dirty.v3.${favoriteNamespace || 'guest'}`; const favoriteSyncedKey = `luri.music.likes-sync-last.v3.${favoriteNamespace || 'guest'}`;
  const favoriteInitialRef = useRef(null);
  if (!favoriteInitialRef.current) {
    let accountItems = []; let dirty = false;
    try { accountItems = JSON.parse(localStorage.getItem(likedStoreKey) || '[]'); dirty = Boolean(Number(localStorage.getItem(favoriteDirtyKey))); } catch { /* Use the server backup when storage is unavailable. */ }
    const backupItems = Array.isArray(favoriteBackup) ? favoriteBackup : [];
    const source = favoriteSyncEnabled && !dirty ? 'backup' : 'account';
    const items = source === 'account' ? accountItems : backupItems;
    favoriteInitialRef.current = { source, items: canonicalTracks(items).filter((track) => track.binding) };
  }
  const restoreResults = () => readTrackStore(STORE_SEARCH).filter((track) => track.binding);
  const [query, setQuery] = useState(() => localStorage.getItem(STORE_QUERY) || ''); const [results, setResults] = useState(restoreResults); const [cachedResults, setCachedResults] = useState(restoreResults); const [recentSearches, setRecentSearches] = useState(() => readStore(STORE_RECENT_SEARCHES).filter((item) => typeof item === 'string').slice(0, 10)); const [searchFocused, setSearchFocused] = useState(false); const [activeSingerSuggestion, setActiveSingerSuggestion] = useState(-1); const [searchState, setSearchState] = useState('');
  const [listView, setListView] = useState(() => routeView(routePath));
  const [chartPlatform, setChartPlatform] = useState('netease'); const [chartType, setChartType] = useState('rising'); const [chartData, setChartData] = useState(() => hydrateChart(readChartStore('netease', 'rising'))); const [chartLoading, setChartLoading] = useState(false); const [chartState, setChartState] = useState('');
  const [mobileView, setMobileView] = useState('playlist');
  const [mobileNowPanel, setMobileNowPanel] = useState('cover');
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getTheme);
  const [playerStyle, setPlayerStyle] = useState(() => { try { return localStorage.getItem('luri.music.player-style.v1') === 'classic' ? 'classic' : 'immersive'; } catch { return 'immersive'; } });
  const [activeQueue, setActiveQueue] = useState('normal');
  const [resultPage, setResultPage] = useState(0); const [hasMoreResults, setHasMoreResults] = useState(false); const [loadingMore, setLoadingMore] = useState(false);
  const [tracks, setTracks] = useState(() => readTrackStore(STORE_QUEUE).filter((track) => track.binding)); const [likedTracks, setLikedTracks] = useState(() => favoriteInitialRef.current.items); const [randomTracks, setRandomTracks] = useState(() => readTrackStore(STORE_RANDOM_LIST).filter((track) => track.binding).slice(0, 50)); const [playbackQueue, setPlaybackQueue] = useState([]); const [currentId, setCurrentId] = useState(null); const [playing, setPlaying] = useState(false); const [playbackState, setPlaybackState] = useState('idle'); const [playbackTrackId, setPlaybackTrackId] = useState(null); const [playbackAttempt, setPlaybackAttempt] = useState(0); const [artworkBackground, setArtworkBackground] = useState(null);
  const [progress, setProgress] = useState(0); const [duration, setDuration] = useState(0); const [playbackMode, setPlaybackMode] = useState(readPlaybackMode);
  const [volume, setVolume] = useState(0.8); const [muted, setMuted] = useState(false);
  const [lyrics, setLyrics] = useState(''); const [translation, setTranslation] = useState(''); const [lyricsState, setLyricsState] = useState('');
  const { library, updateLibrary, syncState } = useMusicLibrary(favoriteNamespace, favoriteSyncEnabled, notify);
  const randomPreferences = readRandomPreferences(library.settings?.randomPreferences);
  const [artOverrides, setArtOverrides] = useState({}); const rowArtworkRef = useRef({ tried: new Set(), cacheTried: new Set(), queue: [], active: 0 });
  const [localTracks, setLocalTracks] = useState([]); const [libraryDialog, setLibraryDialog] = useState(''); const [dialogTrack, setDialogTrackState] = useState(null); const [playlistSelection, setPlaylistSelection] = useState([]); const [newPlaylistName, setNewPlaylistName] = useState(''); const [dialogPlaylist, setDialogPlaylist] = useState(null);
  const libraryDialogRef = useRef(null); const nowPanelRef = useRef(null);
  const setDialogTrack = (track) => {
    setDialogTrackState(track);
    if (!track) return;
    setPlaylistSelection(library.playlists.filter((playlist) => playlist.tracks.some((item) => samePlaylistTrack(item, track))).map((playlist) => playlist.id));
    setNewPlaylistName('');
  };
  const lyricsRef = useRef(null); const musicListRef = useRef(null); const listEndRef = useRef(null); const currentRowRef = useRef(null); const searchFormRef = useRef(null); const searchSuggestionsRef = useRef(null); const locatedTrackRef = useRef('');
  const localFilesRef = useRef(null); const localFolderRef = useRef(null); const importRef = useRef(null); const localUrlsRef = useRef(new Set());
  const searchInputRef = useRef(null); const mobileNowSwipeRef = useRef(null);
  const resolveRequestRef = useRef(null); const chartRequestRef = useRef(null); const mediaDeadlineRef = useRef(null); const mediaDeadlineTrackRef = useRef(''); const ignoreAudioErrorRef = useRef(false); const failedPlaybackIdsRef = useRef(new Set()); const playbackRefreshModesRef = useRef(new Map()); const artworkRefreshIdsRef = useRef(new Set());
  const likedTracksRef = useRef(likedTracks); const favoriteMutationRef = useRef(0); const favoriteSyncRef = useRef({ syncing: false, pulling: false, timer: null, schedule: null, pull: null, dirtySince: (() => { try { return Number(localStorage.getItem(favoriteDirtyKey)) || 0; } catch { return 0; } })() });
  const loadingMoreRef = useRef(false); const activeSearchRef = useRef(query.trim()); const searchRequestRef = useRef(null);
  const mediaActionsRef = useRef({ play: () => {}, pause: () => {}, previous: () => {}, next: () => {} });
  const playRejectionRef = useRef(() => {});
  const randomBudgetRef = useRef({ songId: '', timer: null }); const randomBudgetExpiredRef = useRef(() => {});
  const randomHistoryKey = 'luri.music.random-history.v1'; const storedRandomHistory = useRef(readSession(randomHistoryKey));
  const randomRequest = useRef(null); const randomSession = useRef(0); const randomSwitchRef = useRef(null); const randomListWriteIdRef = useRef(''); const historyStartIdRef = useRef(''); const pendingRestoreRef = useRef(null); const playMode = useRef('manual'); const playbackListRef = useRef('');
  const shufflePlaybackRef = useRef({ queueKey: '', history: [], index: -1 });

  useEffect(() => {
    if (!searchFocused) return undefined;
    const hideSearchHistory = (event) => {
      if (searchFormRef.current?.contains(event.target)) return;
      setSearchFocused(false);
      setActiveSingerSuggestion(-1);
    };
    document.addEventListener('pointerdown', hideSearchHistory);
    return () => document.removeEventListener('pointerdown', hideSearchHistory);
  }, [searchFocused]);
  const randomBatchRef = useRef({ tracks: [], next: null, request: null }); const randomFailuresRef = useRef(0); const randomSingers = useRef(Array.isArray(storedRandomHistory.current.singers) ? storedRandomHistory.current.singers : []); const randomTrackKeys = useRef(Array.isArray(storedRandomHistory.current.tracks) ? storedRandomHistory.current.tracks : []);
  const [randomLoading, setRandomLoading] = useState(false);
  // The ref drives playback logic; the state lets the home card show the random track.
  const [randomMode, setRandomMode] = useState(false);
  const setPlayMode = (mode) => { playMode.current = mode; setRandomMode(mode === 'random'); };
  // Which way the last switch went (the incoming song slides in from that side), and the song whose URL is being refreshed.
  const [switchDirection, setSwitchDirection] = useState('next'); const [recoveringId, setRecoveringId] = useState('');
  const [toast, setToast] = useState(null);
  const activeTracks = activeQueue === 'favorites' ? likedTracks : tracks;
  const current = playbackQueue.find((track) => track.songId === currentId) || activeTracks.find((track) => track.songId === currentId);
  const activeArtworkBackground = artworkBackground?.songId === currentId ? artworkBackground.url : '';
  const resolveTrackRef = useRef(current); resolveTrackRef.current = current;
  const resolveSongId = current?.songId; const resolveUrl = current?.url;
  const lyricsTrackRef = useRef(current); lyricsTrackRef.current = current;
  const singerQuery = singerSearchKey(query);
  const singerSuggestions = singerQuery ? SINGERS.filter((singer) => singerSearchKey(singer).startsWith(singerQuery)) : [];
  const searchSuggestions = singerSuggestions.length ? singerSuggestions : recentSearches;
  const searchHistoryOpen = searchFocused && searchSuggestions.length > 0;
  const translatedByTime = new Map(parsedLyrics(translation).filter((line) => line.time >= 0).map((line) => [line.time.toFixed(3), line.text]));
  const lyricLines = parsedLyrics(lyrics || translation).map((line) => ({ ...line, translation: lyrics ? translatedByTime.get(line.time.toFixed(3)) || '' : '' }));
  const activeLyric = lyricLines.reduce((active, line, index) => line.time >= 0 && line.time <= progress ? index : active, -1);
  // Random play has backup songs, so each song gets a fixed time to start instead of using up every retry.
  const clearRandomBudget = () => { const budget = randomBudgetRef.current; if (budget.timer) window.clearTimeout(budget.timer); budget.timer = null; budget.songId = ''; };
  const beginRandomBudget = (songId) => { clearRandomBudget(); randomBudgetRef.current = { songId, timer: window.setTimeout(() => randomBudgetExpiredRef.current(songId), RANDOM_TRACK_BUDGET_MS) }; };
  const clearMediaDeadline = () => { if (mediaDeadlineRef.current) window.clearTimeout(mediaDeadlineRef.current); mediaDeadlineRef.current = null; mediaDeadlineTrackRef.current = ''; };
  // Media keys animate the matching buttons in both players, like a click does.
  const pulseControl = useCallback((name) => { document.querySelectorAll(`[data-control="${name}"]`).forEach(pressFeedback); }, []);
  const beginMediaDeadline = (id) => {
    clearMediaDeadline(); mediaDeadlineTrackRef.current = id;
    mediaDeadlineRef.current = window.setTimeout(() => {
      if (mediaDeadlineTrackRef.current !== id) return;
      ignoreAudioErrorRef.current = true; audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.load();
      setPlaying(false); clearMediaDeadline();
      handlePlaybackFailure('音频加载超时，已自动播放下一首');
    }, MEDIA_LOAD_TIMEOUT_MS);
  };

  useEffect(() => {
    document.body.classList.toggle('has-global-music-player', !isMusicPage);
    return () => { document.body.classList.remove('has-global-music-player'); resolveRequestRef.current?.abort(); chartRequestRef.current?.abort(); searchRequestRef.current?.abort(); if (mediaDeadlineRef.current) window.clearTimeout(mediaDeadlineRef.current); };
  }, [isMusicPage]);
  useEffect(() => () => { localUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); localUrlsRef.current.clear(); if (randomBudgetRef.current.timer) window.clearTimeout(randomBudgetRef.current.timer); }, []);
  // iOS Safari lets an audio element start by itself only after a tap has touched it. Random and
  // list play call play() after network requests, outside the tap, so the first song stayed at
  // 正在缓冲. Loading the still-empty element during the page's first tap unlocks it (howler.js
  // does the same); with no src it fetches nothing and fires no events the player reacts to.
  useEffect(() => {
    const gestures = ['touchend', 'click', 'keydown'];
    const release = () => gestures.forEach((name) => document.removeEventListener(name, unlock, true));
    function unlock() {
      const media = audio.current; if (!media) return;
      if (!media.getAttribute('src')) media.load();
      release();
    }
    gestures.forEach((name) => document.addEventListener(name, unlock, true));
    return release;
  }, []);
  useEffect(() => {
    if (activeSingerSuggestion >= 0) searchSuggestionsRef.current?.querySelector('.music-search-history__item.active')?.scrollIntoView({ block: 'nearest' });
  }, [activeSingerSuggestion]);
  useEffect(() => {
    if (!currentId) return;
    if (activeQueue === 'favorites' && !likedTracks.some((track) => track.songId === currentId) && tracks.some((track) => track.songId === currentId)) setActiveQueue('normal');
    if (activeQueue === 'normal' && !tracks.some((track) => track.songId === currentId) && likedTracks.some((track) => track.songId === currentId)) setActiveQueue('favorites');
  }, [currentId, activeQueue, tracks, likedTracks]);

  useEffect(() => {
    if (!audio.current || !current?.url) return;
    const restore = pendingRestoreRef.current?.songId === current.songId ? pendingRestoreRef.current : null;
    setPlaybackTrackId(current.songId); setPlaybackState(restore?.wasPlaying === false ? 'paused' : 'loading'); setProgress(restore?.currentTime || 0); setDuration(0);
    ignoreAudioErrorRef.current = false; audio.current.src = current.url; audio.current.load(); beginMediaDeadline(current.songId);
    if (restore?.wasPlaying === false) clearMediaDeadline();
    else audio.current.play().catch((error) => playRejectionRef.current(error));
  }, [currentId, current?.songId, current?.url]);
  useEffect(() => { if (listView === 'search') setCachedResults(results); }, [listView, results]);
  useEffect(() => { try { localStorage.setItem(STORE_SEARCH, JSON.stringify(cachedResults)); localStorage.setItem(STORE_QUERY, query); } catch { /* Storage is unavailable in private browsing. */ } }, [cachedResults, query]);
  useEffect(() => { try { localStorage.setItem(STORE_RECENT_SEARCHES, JSON.stringify(recentSearches)); } catch { /* Storage is unavailable in private browsing. */ } }, [recentSearches]);
  useEffect(() => { try { localStorage.setItem(STORE_PLAYBACK_MODE, playbackMode); } catch { /* Storage is unavailable in private browsing. */ } }, [playbackMode]);
  useEffect(() => { try { localStorage.setItem('luri.music.player-style.v1', playerStyle); } catch { /* Storage is unavailable in private browsing. */ } }, [playerStyle]);
  useEffect(() => {
    const resolvingTrack = resolveTrackRef.current;
    if (!resolvingTrack || resolvingTrack.url) return undefined;
    setPlaybackTrackId(resolvingTrack.songId); setPlaybackState('resolving');
    const controller = new AbortController();
    resolveRequestRef.current = controller;
    const recovery = playbackRefreshModesRef.current.get(resolvingTrack.songId);
    const refresh = recovery?.mode || false;
    const requestedQuality = recovery?.quality || playbackQuality;
    musicRequest('resolve', { songId: resolvingTrack.songId, title: resolvingTrack.title, artist: resolvingTrack.artist, album: resolvingTrack.album, quality: requestedQuality, binding: resolvingTrack.binding, refresh }, controller.signal).then(providerPayload).then((payload) => {
      if (!payload.url || Date.parse(payload.expiresAt || '') <= Date.now() + 5000) { const failure = new Error('播放地址不可用'); failure.code = 'url_expired'; throw failure; }
      if (!controller.signal.aborted) {
        if (!refresh && recovery?.failedUrl && payload.url === recovery.failedUrl) {
          playbackRefreshModesRef.current.set(resolvingTrack.songId, { mode: recovery.refreshMode || 'url', quality: requestedQuality, attempts: Number(recovery.attempts || 0) + 1 });
          setPlaybackAttempt((attempt) => attempt + 1);
          return;
        }
        const attemptedSources = Array.isArray(payload.attemptedSources) ? payload.attemptedSources : [];
        const resolved = { url: payload.url, binding: canonicalBinding(payload.binding) || resolvingTrack.binding, expiresAt: resolvedExpiry(payload), requestedQuality: playbackQuality, quality: payload.quality || '', bitrate: payload.bitrate || null, degraded: Boolean(payload.degraded), qualityVerified: Boolean(payload.qualityVerified), attemptedSources };
        rememberSong({ ...resolvingTrack, ...resolved });
        const update = (track) => track.songId === resolvingTrack.songId ? { ...track, ...resolved } : track;
        setTracks((items) => items.map(update));
        setLikedTracks((items) => items.map((track) => sameFavorite(track, resolvingTrack) ? { ...track, binding: resolved.binding } : track));
        setPlaybackQueue((items) => items.map(update));
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (loginExpired(error)) { setPlaying(false); setPlaybackState('paused'); clearMediaDeadline(); clearRandomBudget(); return; }
      if (providerDenied(error)) {
        setPlaying(false); setPlaybackTrackId(resolvingTrack.songId); setPlaybackState('error'); clearMediaDeadline();
        if (!restoreRandomSwitch('Provider 认证失败，已恢复上一首')) { setPlayMode('manual'); showToast('Provider 认证失败，请重新配置认证信息', 'warning'); }
        return;
      }
      if (['no_candidate', 'all_resolvers_failed', 'quality_unavailable'].includes(error?.code)) {
        setPlaying(false); discardCurrentUrl();
        const message = error.code === 'no_candidate' ? '未找到可播放音源，已自动播放下一首' : '所有音源均解析失败，已自动播放下一首';
        if (playMode.current === 'random') playNextRandom(message); else skipFailedTrack(message);
      } else handlePlaybackFailure();
    }).finally(() => { if (resolveRequestRef.current === controller) resolveRequestRef.current = null; });
    return () => { controller.abort(); if (resolveRequestRef.current === controller) resolveRequestRef.current = null; };
  }, [resolveSongId, resolveUrl, playbackAttempt, playbackQuality]);
  useEffect(() => {
    if ('mediaSession' in navigator && current) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title || '未知歌曲',
        artist: current.artist || '未知艺人',
        album: current.album || '',
        artwork: usableArt(current.art) ? [
          { src: current.art, sizes: '96x96', type: 'image/jpeg' },
          { src: current.art, sizes: '128x128', type: 'image/jpeg' },
          { src: current.art, sizes: '192x192', type: 'image/jpeg' },
          { src: current.art, sizes: '256x256', type: 'image/jpeg' },
          { src: current.art, sizes: '384x384', type: 'image/jpeg' },
          { src: current.art, sizes: '512x512', type: 'image/jpeg' },
        ] : []
      });
      navigator.mediaSession.setActionHandler('play', () => mediaActionsRef.current.play());
      navigator.mediaSession.setActionHandler('pause', () => mediaActionsRef.current.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => mediaActionsRef.current.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => mediaActionsRef.current.next());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        if (audio.current) {
          const skipTime = details.seekOffset || 10;
          audio.current.currentTime = Math.max(audio.current.currentTime - skipTime, 0);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        if (audio.current) {
          const skipTime = details.seekOffset || 10;
          audio.current.currentTime = Math.min(audio.current.currentTime + skipTime, audio.current.duration || 0);
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audio.current && details.seekTime !== null && details.seekTime !== undefined) {
          audio.current.currentTime = details.seekTime;
        }
      });
    }
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      }
    };
  }, [current]);
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
    syncPositionState();
  }, [playing]);
  // The lock screen and system media controls draw their progress bar from this. The system
  // advances it on its own while playing, so it is only set when duration, position or rate jump.
  function syncPositionState() {
    if (typeof navigator.mediaSession?.setPositionState !== 'function') return;
    const media = audio.current; const length = media?.duration;
    try {
      if (!media || !Number.isFinite(length) || length <= 0) { navigator.mediaSession.setPositionState(); return; }
      navigator.mediaSession.setPositionState({ duration: length, playbackRate: media.playbackRate || 1, position: Math.min(Math.max(0, media.currentTime || 0), length) });
    } catch { /* Browsers reject a position state they consider invalid; the progress bar simply stays hidden. */ }
  }
  useEffect(() => {
    if (!current || current.sourceType === 'local' || usableArt(current.art) || !current.binding) return undefined;
    const controller = new AbortController();
    musicRequest('artwork', { songId: current.songId, title: current.title, artist: current.artist, album: current.album, binding: current.binding }, controller.signal).then(providerPayload).then((payload) => {
      if (payload.url && !controller.signal.aborted) applyArtwork(current, payload.url, canonicalBinding(payload.binding));
    }).catch(() => {});
    return () => controller.abort();
  }, [current]);
  // Artwork comes from the Provider only for the song being played, when the stored
  // or synced URL is missing or fails to load. Favourites keep the result and sync it.
  function applyArtwork(song, url, binding) {
    rememberSong({ ...song, art: url, binding: binding || song.binding });
    setArtOverrides((items) => ({ ...items, [song.songId]: url }));
    const update = (track) => track.songId === song.songId ? { ...track, art: url, binding: binding || track.binding } : track;
    setTracks((items) => items.map(update)); setPlaybackQueue((items) => items.map(update));
    setResults((items) => items.map(update)); setRandomTracks((items) => items.map(update));
    // Saved playlists and history keep the working URL so the next visit needs no request.
    const stale = (items) => items.some((track) => track.songId === song.songId && track.art !== url);
    if (storableArt(url) && (library.history.some((track) => track.songId === song.songId && track.art !== url) || library.playlists.some((playlist) => stale(playlist.tracks)))) {
      const art = (track) => track.songId === song.songId ? { ...track, art: url } : track;
      updateLibrary((value) => ({ ...value, history: value.history.map(art), playlists: value.playlists.map((playlist) => stale(playlist.tracks) ? { ...playlist, tracks: playlist.tracks.map(art) } : playlist) }), { deferSync: true });
    }
    if (!likedTracksRef.current.some((track) => sameFavorite(track, song))) return;
    const next = likedTracksRef.current.map((track) => sameFavorite(track, song) ? { ...track, art: url, binding: binding || track.binding } : track);
    likedTracksRef.current = next; setLikedTracks(next);
    if (storableArt(url)) markFavoritesDirty();
  }
  // A list cover that is missing, unusable or fails to load asks the Provider once
  // per song per session, two at a time, and only after it scrolls into view.
  // Queued requests are dropped when the list changes.
  function requestRowArtwork(track) {
    const state = rowArtworkRef.current;
    if (!track?.binding || track.sourceType === 'local') return;
    // A cover fetched earlier on this device is tried before asking the Provider.
    const failed = rowArt(track); const cached = usableArt(songCache()[track.songId]?.art);
    if (cached && cached !== failed && !state.cacheTried.has(track.songId)) { state.cacheTried.add(track.songId); setArtOverrides((items) => ({ ...items, [track.songId]: cached })); return; }
    if (!providerClient || state.tried.has(track.songId)) return;
    state.tried.add(track.songId); state.queue.push({ track, failed }); pumpRowArtwork();
  }
  function pumpRowArtwork() {
    const state = rowArtworkRef.current;
    while (state.active < 2 && state.queue.length) {
      const { track, failed } = state.queue.shift(); state.active += 1;
      const params = { songId: track.songId, title: track.title, artist: track.artist, album: track.album, binding: track.binding };
      const fetchArt = (refresh) => musicRequest('artwork', refresh ? { ...params, refresh: 1 } : params).then(providerPayload);
      // A cached answer may still be the URL that just failed; only then bypass the cache.
      fetchArt(false).then((payload) => usableArt(payload.url) && payload.url !== failed ? payload : fetchArt(true)).then((payload) => {
        if (usableArt(payload.url) && payload.url !== failed) applyArtwork(track, payload.url, canonicalBinding(payload.binding));
      }).catch(() => {}).finally(() => { state.active -= 1; pumpRowArtwork(); });
    }
  }
  const refreshArtwork = () => {
    if (!current || current.sourceType === 'local' || artworkRefreshIdsRef.current.has(current.songId)) return;
    artworkRefreshIdsRef.current.add(current.songId);
    void musicRequest('artwork', { songId: current.songId, title: current.title, artist: current.artist, album: current.album, binding: current.binding, refresh: 1 }).then(providerPayload).then((payload) => {
      if (!payload.url) throw new Error('No artwork');
      applyArtwork(current, payload.url, canonicalBinding(payload.binding));
    }).catch(() => {});
  };
  const artworkLoaded = (event) => {
    const loaded = event.currentTarget.currentSrc;
    // The default cover also fires onLoad; only a real cover ends the refresh attempt.
    if (!current || !loaded || loaded === EMPTY_ART) return;
    artworkRefreshIdsRef.current.delete(current.songId);
    if (current.art && current.art !== EMPTY_ART) setArtworkBackground({ songId: current.songId, url: loaded });
  };
  useEffect(() => { try { localStorage.setItem(STORE_QUEUE, JSON.stringify(tracks.filter((track) => track.sourceType !== 'local').slice(0, 50).map(({ url: _url, ...track }) => track))); } catch { /* Storage is unavailable in private browsing. */ } }, [tracks]);
  useEffect(() => { try { localStorage.setItem(STORE_RANDOM_LIST, JSON.stringify(randomTracks.slice(0, 50).map(({ url: _url, expiresAt: _expiresAt, ...track }) => track))); } catch { /* Storage is unavailable in private browsing. */ } }, [randomTracks]);
  useEffect(() => { likedTracksRef.current = likedTracks; try { localStorage.setItem(likedStoreKey, JSON.stringify(minimalFavorites(likedTracks))); } catch { /* Storage is unavailable in private browsing. */ } }, [likedTracks, likedStoreKey]);
  useEffect(() => {
    if (!favoriteSyncEnabled || !favoriteNamespace) return undefined;
    const state = favoriteSyncRef.current; let stopped = false;
    const readDirtySince = () => { try { const stored = Number(localStorage.getItem(favoriteDirtyKey)) || 0; if (stored) state.dirtySince = stored; } catch { /* Use the in-memory value when storage is unavailable. */ } return state.dirtySince; };
    const rememberDirtySince = (value) => { state.dirtySince = value; try { if (value) localStorage.setItem(favoriteDirtyKey, String(value)); else localStorage.removeItem(favoriteDirtyKey); } catch { /* Storage is unavailable in private browsing. */ } };
    const rememberSyncedAt = (value) => { const timestamp = Date.parse(value || '') || Date.now(); try { localStorage.setItem(favoriteSyncedKey, String(timestamp)); } catch { /* Storage is unavailable in private browsing. */ } };
    const scheduleSync = (delay = FAVORITES_SYNC_DEBOUNCE_MS) => {
      if (stopped) return;
      if (state.timer) window.clearTimeout(state.timer);
      let lastSyncedAt = 0; try { lastSyncedAt = Number(localStorage.getItem(favoriteSyncedKey)) || 0; } catch { /* Sync after the debounce when storage is unavailable. */ }
      const intervalRemaining = Math.max(0, FAVORITES_WRITE_INTERVAL_MS - (Date.now() - lastSyncedAt));
      state.timer = window.setTimeout(() => { state.timer = null; void syncBackup(); }, Math.max(delay, intervalRemaining));
    };
    const syncBackup = async (keepalive = false) => {
      if (state.syncing || !readDirtySince()) return;
      state.syncing = true;
      const mutation = favoriteMutationRef.current; const items = minimalFavorites(likedTracksRef.current); const snapshot = JSON.stringify(items);
      let wrote = false; let synced = false;
      try {
        const response = await fetch('/api/favorites', { method: 'PUT', credentials: 'same-origin', keepalive, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
        await sessionExpired(response);
        const payload = response.ok ? await response.json() : null;
        if (response.ok) { rememberSyncedAt(payload?.updatedAt); wrote = true; }
        const latestSnapshot = JSON.stringify(minimalFavorites(likedTracksRef.current));
        if (response.ok && mutation === favoriteMutationRef.current && snapshot === latestSnapshot) {
          const canonical = canonicalTracks(Array.isArray(payload?.items) ? payload.items : items);
          likedTracksRef.current = canonical; setLikedTracks(canonical); rememberDirtySince(0); synced = true;
        }
      } catch { /* Keep the dirty marker and retry shortly. */ }
      finally {
        state.syncing = false;
        const changedDuringSync = mutation !== favoriteMutationRef.current || snapshot !== JSON.stringify(minimalFavorites(likedTracksRef.current));
        if (!stopped && readDirtySince()) scheduleSync(wrote || synced || changedDuringSync ? FAVORITES_SYNC_DEBOUNCE_MS : FAVORITES_SYNC_RETRY_MS);
      }
    };
    const pullBackup = async () => {
      if (stopped || state.pulling || state.syncing || readDirtySince()) return;
      state.pulling = true; const mutation = favoriteMutationRef.current;
      try {
        const response = await fetch('/api/favorites', { credentials: 'same-origin', cache: 'no-store' });
        await sessionExpired(response);
        const payload = response.ok ? await response.json() : null;
        if (!stopped && response.ok && mutation === favoriteMutationRef.current && !readDirtySince()) {
          const items = canonicalTracks(payload?.items);
          likedTracksRef.current = items; setLikedTracks(items); rememberSyncedAt(payload?.updatedAt);
        }
      } catch { /* The local snapshot remains available while offline. */ }
      finally { state.pulling = false; }
    };
    const flushBeforeExit = () => { if (readDirtySince()) void syncBackup(true); };
    state.schedule = scheduleSync; state.pull = pullBackup;
    if (favoriteInitialRef.current.source === 'backup') rememberSyncedAt(favoriteBackupUpdatedAt);
    if (readDirtySince()) scheduleSync();
    window.addEventListener('pagehide', flushBeforeExit);
    return () => {
      stopped = true; state.schedule = null; state.pull = null; if (state.timer) window.clearTimeout(state.timer); state.timer = null;
      window.removeEventListener('pagehide', flushBeforeExit);
    };
  }, [favoriteSyncEnabled, favoriteBackupUpdatedAt, favoriteDirtyKey, favoriteNamespace, favoriteSyncedKey]);
  useEffect(() => { if (listView === 'likes') void favoriteSyncRef.current.pull?.(); }, [favoriteSyncEnabled, listView]);
  useEffect(() => { if (!audio.current) return; audio.current.volume = volume; audio.current.muted = muted; }, [volume, muted]);
  useEffect(() => { document.documentElement.style.setProperty('--music-progress', `${duration ? Math.min(100, Math.max(0, progress / duration * 100)) : 0}%`); }, [duration, progress]);
  useEffect(() => {
    if (!currentId) return undefined;
    if (window.matchMedia('(max-width: 700px)').matches && mobileView !== 'playlist') return undefined;
    const frame = window.requestAnimationFrame(() => {
      const row = currentRowRef.current; const list = scrollParentOf(musicListRef.current);
      // Leaving the list forgets where it was located, so returning finds the song again.
      if (!list || !row) { locatedTrackRef.current = ''; return; }
      const locationKey = `${listView}:${activeSearchRef.current}:${currentId}:${mobileView}`;
      if (locatedTrackRef.current === locationKey) return;
      locatedTrackRef.current = locationKey;
      const listBounds = list.getBoundingClientRect(); const rowBounds = row.getBoundingClientRect();
      const top = list.scrollTop + rowBounds.top - listBounds.top - (list.clientHeight - rowBounds.height) / 2;
      list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentId, listView, mobileView, results, tracks, likedTracks, chartData]);
  useEffect(() => {
    const body = lyricsRef.current; if (!body) return;
    lyricsRef.current = body;
    const nodes = body.querySelectorAll('p'); nodes.forEach((node, index) => node.classList.toggle('active', index === activeLyric));
    const active = nodes[activeLyric]; if (!active) return;
    // A manual browse is temporary: every new lyric line returns to its play anchor.
    const desktop = window.matchMedia('(min-width: 701px)').matches;
    const anchor = desktop ? body.clientHeight / 2 + active.offsetHeight : body.clientHeight / 2;
    body.scrollTo({ top: Math.max(0, active.offsetTop - anchor + active.offsetHeight / 2), behavior: 'smooth' });
  }, [activeLyric, mobileNowPanel, mobileView]);
  useEffect(() => { if (lyricsRef.current) lyricsRef.current.scrollTop = 0; }, [current?.songId, lyrics]);
  useEffect(() => {
    const lyricTrack = lyricsTrackRef.current;
    if (!lyricTrack) { setLyrics(''); setTranslation(''); setLyricsState(''); return undefined; }
    if (lyricTrack.sourceType === 'local') { setLyrics(''); setTranslation(''); setLyricsState('本地歌曲暂不提供在线歌词'); return undefined; }
    const controller = new AbortController(); setLyrics(''); setTranslation(''); setLyricsState('正在加载歌词…');
    musicRequest('lyrics', { songId: lyricTrack.songId, title: lyricTrack.title, artist: lyricTrack.artist, album: lyricTrack.album, binding: lyricTrack.binding }, controller.signal).then(providerPayload).then((payload) => { if (!controller.signal.aborted) { const text = payload.lyrics || payload.translation || ''; setLyrics(payload.lyrics || ''); setTranslation(payload.translation || ''); setLyricsState(text ? '' : '暂无匹配歌词'); } }).catch((error) => { if (!controller.signal.aborted) { setLyricsState('暂无匹配歌词'); if (providerDenied(error)) showToast('Provider 没有访问权限，请重新配置或联系服务提供方', 'warning'); } });
    return () => controller.abort();
  }, [current?.songId, musicRequest]);
  const stopRandom = () => {
    randomSession.current += 1;
    if (randomRequest.current) randomRequest.current.abort();
    randomRequest.current = null; randomSwitchRef.current = null; randomListWriteIdRef.current = ''; pendingRestoreRef.current = null;
    setPlayMode('manual'); setRandomLoading(false); clearRandomBudget();
    randomBatchRef.current.request?.abort(); randomBatchRef.current = { tracks: [], next: null, request: null }; randomFailuresRef.current = 0;
  };
  const rememberRandomTrack = (track, singer = '') => {
    const singers = [...randomSingers.current, singer, ...trackArtists(track)].filter(Boolean);
    randomSingers.current = singers.filter((item, index) => singers.findLastIndex((candidate) => randomTextKey(candidate) === randomTextKey(item)) === index).slice(-30);
    const key = randomTrackKey(track); randomTrackKeys.current = [...randomTrackKeys.current.filter((item) => item !== key), key].filter(Boolean).slice(-50);
    writeSession(randomHistoryKey, { singers: randomSingers.current, tracks: randomTrackKeys.current });
  };
  const rememberRandomListTrack = (track) => {
    const canonical = canonicalTrack(track);
    if (!canonical) return;
    const { url: _url, expiresAt: _expiresAt, ...stored } = canonical;
    setRandomTracks((items) => [stored, ...items.filter((item) => item.songId !== stored.songId)].slice(0, 50));
  };
  const restoreRandomSwitch = (message = '下一首加载失败，已恢复上一首') => {
    const snapshot = randomSwitchRef.current;
    if (!snapshot) return false;
    clearRandomBudget(); randomSwitchRef.current = null; randomListWriteIdRef.current = ''; randomSession.current += 1; randomRequest.current?.abort(); randomRequest.current = null;
    setPlayMode(snapshot.mode); pendingRestoreRef.current = { songId: snapshot.songId, currentTime: snapshot.currentTime, wasPlaying: snapshot.wasPlaying };
    setPlaybackQueue(snapshot.queue); setCurrentId(snapshot.songId); setPlaybackTrackId(snapshot.songId); setProgress(snapshot.currentTime); setPlaybackState(snapshot.wasPlaying ? 'loading' : 'paused'); setRandomLoading(false);
    if (currentId === snapshot.songId && audio.current) {
      audio.current.currentTime = snapshot.currentTime; pendingRestoreRef.current = null;
      if (snapshot.wasPlaying) audio.current.play().catch((error) => playRejectionRef.current(error));
    }
    if (message) showToast(message, 'warning');
    return true;
  };
  const hasAccess = () => !onRequireAccess || onRequireAccess() !== false;
  const resetShufflePlayback = (queue, selectedId = currentId) => {
    const ids = queue.map((track) => track.songId);
    const hasSelected = Boolean(selectedId && ids.includes(selectedId));
    shufflePlaybackRef.current = {
      queueKey: ids.join('\u001f'),
      history: hasSelected ? [selectedId, ...shuffled(ids.filter((id) => id !== selectedId))] : shuffled(ids),
      index: hasSelected ? 0 : -1,
    };
    return shufflePlaybackRef.current;
  };
  const syncShufflePlayback = (queue) => {
    const ids = queue.map((track) => track.songId);
    const queueKey = ids.join('\u001f');
    const state = shufflePlaybackRef.current;
    if (state.queueKey === queueKey && state.history.length) {
      const currentIndex = state.history.lastIndexOf(currentId);
      if (currentIndex >= 0) state.index = currentIndex;
      return state;
    }
    const valid = new Set(ids);
    const retained = state.history.filter((id) => valid.has(id));
    const missing = ids.filter((id) => !retained.includes(id));
    state.queueKey = queueKey;
    state.history = [...retained, ...shuffled(missing)];
    const currentIndex = state.history.lastIndexOf(currentId);
    if (currentId && valid.has(currentId) && currentIndex < 0) state.history.push(currentId);
    state.index = currentId ? state.history.lastIndexOf(currentId) : -1;
    return state;
  };
  const selectShuffleOffset = (queue, offset, preserveFailures = false) => {
    if (!queue.length) return;
    if (queue.length === 1) { selectTrack(queue[0].songId, queue, playMode.current, preserveFailures); return; }
    const state = syncShufflePlayback(queue);
    if (offset > 0 && state.index + 1 >= state.history.length) {
      const nextCycle = shuffled(queue.map((track) => track.songId).filter((id) => id !== currentId));
      state.history.push(...nextCycle);
    }
    const targetIndex = state.index + offset;
    if (targetIndex < 0 || targetIndex >= state.history.length) return;
    state.index = targetIndex;
    selectTrack(state.history[targetIndex], null, playMode.current, preserveFailures);
  };
  const cyclePlaybackMode = () => {
    const index = PLAYBACK_MODES.indexOf(playbackMode);
    const nextMode = PLAYBACK_MODES[(index + 1) % PLAYBACK_MODES.length];
    if (nextMode === 'shuffle') resetShufflePlayback(playbackQueue.length ? playbackQueue : activeTracks);
    setPlaybackMode(nextMode);
    setToast({ title: PLAYBACK_MODE_META[nextMode].label, message: '播放模式已切换', type: 'info', duration: 2200 });
  };
  const selectTrack = (id, queue = null, mode = 'manual', preserveFailures = false) => {
    const candidate = queue?.find((track) => track.songId === id) || playbackQueue.find((track) => track.songId === id) || activeTracks.find((track) => track.songId === id) || localTracks.find((track) => track.songId === id);
    if (candidate?.sourceType !== 'local' && !hasAccess()) return;
    if (!preserveFailures) { failedPlaybackIdsRef.current.clear(); playbackRefreshModesRef.current.delete(id); }
    if (mode === 'manual') stopRandom();
    const sourceQueue = queue?.length ? queue : playbackQueue.some((track) => track.songId === id) ? null : activeTracks;
    const forSelectedQuality = (track) => track.songId === id && track.url && playbackUrlExpired(track) ? { ...track, url: undefined } : track;
    if (sourceQueue?.length) setPlaybackQueue(sourceQueue.map(forSelectedQuality));
    else if (id !== currentId) setPlaybackQueue((items) => items.map(forSelectedQuality));
    clearMediaDeadline(); setPlaybackTrackId(id); setPlaybackState('loading');
    if (id === currentId) {
      if (current?.url && !playbackUrlExpired(current)) { beginMediaDeadline(id); audio.current?.play().catch(handlePlayRejection); }
      else {
        if (current?.url) setPlaybackQueue((items) => (items.length ? items : activeTracks).map(forSelectedQuality));
        setPlaybackState('resolving'); setPlaybackAttempt((attempt) => attempt + 1);
      }
      return;
    }
    if (audio.current) { ignoreAudioErrorRef.current = true; audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); }
    setPlaying(false); setProgress(0); setDuration(0);
    historyStartIdRef.current = id; setCurrentId(id);
  };
  const next = (automatic = false) => {
    const queue = playbackQueue.length ? playbackQueue : activeTracks; if (!queue.length) return;
    if (automatic && playbackMode === 'repeat-one' && current) {
      historyStartIdRef.current = currentId;
      if (audio.current) { audio.current.currentTime = 0; setProgress(0); audio.current.play().catch(handlePlayRejection); }
      return;
    }
    setSwitchDirection('next');
    // Random play picks from its batch in every playback mode; a manual skip can still restore the song.
    if (playMode.current === 'random') { playNextRandom('', !automatic); return; }
    if (playbackMode === 'shuffle') { selectShuffleOffset(queue, 1); return; }
    const index = queue.findIndex((track) => track.songId === currentId);
    selectTrack(queue[index < 0 ? 0 : (index + 1) % queue.length].songId, null, playMode.current);
  };
  // Previous always switches straight to the previous song; when there is none it says so.
  const noPreviousTrack = () => setToast({ title: '没有上一首', message: '当前已是播放记录中的第一首', type: 'info', duration: 2000 });
  const previous = () => {
    const queue = playbackQueue.length ? playbackQueue : activeTracks;
    setSwitchDirection('previous');
    if (playMode.current === 'random') {
      if (restoreRandomSwitch(null)) return;
      const index = randomTracks.findIndex((track) => track.songId === currentId);
      const track = index < 0 ? randomTracks[0] : randomTracks[index + 1];
      if (!track) { noPreviousTrack(); return; }
      playbackListRef.current = 'random'; selectTrack(track.songId, randomTracks, 'random'); return;
    }
    if (playbackMode === 'shuffle') {
      if (queue.length > 1 && syncShufflePlayback(queue).index <= 0) { noPreviousTrack(); return; }
      selectShuffleOffset(queue, -1); return;
    }
    if (!queue.length) { noPreviousTrack(); return; }
    const index = queue.findIndex((track) => track.songId === currentId);
    selectTrack(queue[index <= 0 ? queue.length - 1 : index - 1].songId, null, playMode.current);
  };
  const toggle = () => {
    if (playbackState === 'resolving' || playbackState === 'loading') return;
    if (!playing && current?.sourceType !== 'local' && !hasAccess()) return;
    if (!current && activeTracks[0]) return selectTrack(activeTracks[0].songId, activeTracks);
    if (playing) { audio.current?.pause(); return; }
    if (current && (!current.url || playbackUrlExpired(current))) {
      if (current.url) { const clearUrl = (track) => track.songId === current.songId ? { ...track, url: undefined } : track; setPlaybackQueue((items) => (items.length ? items : activeTracks).map(clearUrl)); }
      failedPlaybackIdsRef.current.clear(); playbackRefreshModesRef.current.delete(current.songId); setRecoveringId(''); setPlaybackTrackId(current.songId); setPlaybackState('resolving'); setPlaybackAttempt((attempt) => attempt + 1); return;
    }
    setPlaybackTrackId(currentId); setPlaybackState('loading'); beginMediaDeadline(currentId);
    if (audio.current && current?.url && !audio.current.getAttribute('src')) { ignoreAudioErrorRef.current = false; audio.current.src = current.url; audio.current.load(); }
    audio.current?.play().catch(handlePlayRejection);
  };
  const markFavoritesDirty = () => {
    favoriteMutationRef.current += 1;
    if (!favoriteSyncRef.current.dirtySince) { let dirtySince = Date.now(); try { dirtySince = Number(localStorage.getItem(favoriteDirtyKey)) || dirtySince; localStorage.setItem(favoriteDirtyKey, String(dirtySince)); } catch { /* Storage is unavailable in private browsing. */ } favoriteSyncRef.current.dirtySince = dirtySince; }
    favoriteSyncRef.current.schedule?.();
  };
  const like = (id) => {
    const song = current || tracks.find((track) => track.songId === id) || results.find((track) => track.songId === id); if (!song) return;
    if (song.sourceType === 'local') { showToast('本地歌曲只在当前设备与当前页面会话中可用', 'warning'); return; }
    const favorite = { songId: song.songId, title: song.title, artist: song.artist, album: song.album, binding: song.binding, art: artworkFor(song) };
    const saved = likedTracksRef.current; const next = saved.some((track) => sameFavorite(track, song)) ? saved.filter((track) => !sameFavorite(track, song)) : [...saved.filter((track) => !sameFavorite(track, song)), favorite];
    likedTracksRef.current = next; setLikedTracks(next); markFavoritesDirty();
  };
  function showToast(message, type = 'error') { setToast({ title: type === 'warning' ? '需要处理' : '播放服务异常', message, type }); }
  function handlePlayRejection(error) {
    // Changing or clearing the media URL rejects the previous play() promise
    // with AbortError. The audio error/selection path already owns recovery;
    // treating this as another failure races the refresh and skips the track.
    if (error?.name === 'AbortError') return;
    clearMediaDeadline();
    // Autoplay was blocked: the song is fine and waits for the user, so random play must not skip it.
    if (error?.name === 'NotAllowedError') { clearRandomBudget(); setPlaying(false); setPlaybackState('paused'); return; }
    // Media loading and decoding failures reject play() and also emit an
    // audio error event. Let onError own that shared failure so a single bad
    // URL cannot refresh once and then immediately skip the track.
    if (audio.current?.error) return;
    ignoreAudioErrorRef.current = true;
    window.setTimeout(() => { ignoreAudioErrorRef.current = false; }, 1000);
    handlePlaybackFailure('播放地址无法加载，已自动播放下一首', error?.name === 'NotSupportedError' ? 'decode' : 'url');
  }
  playRejectionRef.current = handlePlayRejection;
  randomBudgetExpiredRef.current = (songId) => {
    if (randomBudgetRef.current.songId !== songId) return;
    clearRandomBudget();
    if (playMode.current !== 'random' || currentId !== songId) return;
    // Keep the song's URL: clearing it would start a new resolve while a fresh random list loads.
    resolveRequestRef.current?.abort(); clearMediaDeadline();
    ignoreAudioErrorRef.current = true; audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.load();
    setPlaying(false);
    playNextRandom('这首歌加载超时，已自动播放下一首');
  };
  const retryWithRefresh = (mode = 'url') => {
    if (!current) return false;
    const previous = playbackRefreshModesRef.current.get(current.songId);
    // Random play refreshes a song once, then moves on to a backup song.
    if (playMode.current === 'random' && previous) return false;
    const recoveryQuality = playbackQuality;
    if (!previous && current.url) {
      providerClient?.invalidateCache('resolve', { songId: current.songId, quality: recoveryQuality });
      playbackRefreshModesRef.current.set(current.songId, { mode: '', refreshMode: 'url', quality: recoveryQuality, attempts: 1, failedUrl: current.url });
      const clearUrl = (track) => track.songId === current.songId ? { ...track, url: undefined } : track;
      setTracks((items) => items.map(clearUrl));
      setLikedTracks((items) => items.map(clearUrl));
      setPlaybackQueue((items) => (items.length ? items : activeTracks).map(clearUrl));
      setRecoveringId(current.songId); setPlaybackTrackId(current.songId); setPlaybackState('resolving'); setPlaybackAttempt((attempt) => attempt + 1);
      return true;
    }
    // Some malformed or unsupported media URLs stay HTTP-reachable and only
    // surface as a loading timeout. After one URL refresh at the same tier,
    // promote the next recovery to decode so the quality chain can continue.
    const requestedMode = previous?.mode ? mode : 'url';
    const recoveryMode = requestedMode === 'url' && previous?.mode === 'url' && previous?.quality === recoveryQuality ? 'decode' : requestedMode;
    if (previous?.mode === recoveryMode && previous?.quality === recoveryQuality) return false;
    const attempts = Number(previous?.attempts || 0) + 1;
    if (attempts > 5) return false;
    playbackRefreshModesRef.current.set(current.songId, { mode: recoveryMode, quality: recoveryQuality, attempts });
    const clearUrl = (track) => track.songId === current.songId ? { ...track, url: undefined } : track;
    setTracks((items) => items.map(clearUrl));
    setLikedTracks((items) => items.map(clearUrl));
    setPlaybackQueue((items) => (items.length ? items : activeTracks).map(clearUrl));
    setRecoveringId(current.songId); setPlaybackTrackId(current.songId); setPlaybackState('resolving'); setPlaybackAttempt((attempt) => attempt + 1);
    return true;
  };
  const discardCurrentUrl = () => {
    if (!current) return;
    const clearUrl = (track) => track.songId === current.songId ? { ...track, url: undefined } : track;
    setLikedTracks((items) => items.map((track) => sameFavorite(track, current) ? { ...track, url: undefined } : track));
    setTracks((items) => items.map(clearUrl));
    setPlaybackQueue((items) => items.map(clearUrl));
  };
  function skipFailedTrack(message = '歌曲播放失败，已自动播放下一首') {
    const queue = playbackQueue.length ? playbackQueue : activeTracks;
    failedPlaybackIdsRef.current.add(currentId);
    if (queue.length <= 1 || failedPlaybackIdsRef.current.size >= queue.length) {
      setPlaybackTrackId(currentId); setPlaybackState('error'); showToast('播放列表中的歌曲均无法播放，请稍后重试', 'error'); return;
    }
    const currentIndex = queue.findIndex((track) => track.songId === currentId); const startIndex = currentIndex < 0 ? -1 : currentIndex;
    const nextTrack = Array.from({ length: queue.length - 1 }, (_, offset) => queue[(startIndex + offset + 1) % queue.length]).find((track) => !failedPlaybackIdsRef.current.has(track.songId));
    if (!nextTrack) { setPlaybackState('error'); return; }
    showToast(message, 'warning'); selectTrack(nextTrack.songId, null, playMode.current, true);
  }
  function handlePlaybackFailure(message = '歌曲播放失败，已自动播放下一首', refreshMode = 'url') {
    setPlaying(false);
    if (retryWithRefresh(refreshMode)) { setToast({ title: '正在重新获取音源', message: '当前播放地址无法使用', type: 'info', duration: 2200 }); return; }
    discardCurrentUrl();
    if (playMode.current === 'random') { playNextRandom(message); return; }
    skipFailedTrack(message);
  }
  const handleLoadedMetadata = (event) => {
    const media = event.currentTarget;
    const mediaDuration = media.duration;
    if (Number.isFinite(mediaDuration) && mediaDuration > 0 && mediaDuration < MIN_PLAYABLE_DURATION_SECONDS) {
      clearMediaDeadline(); media.pause(); setDuration(0);
      handlePlaybackFailure('音频时长不足 20 秒，已自动播放下一首', 'url');
      return;
    }
    const restore = pendingRestoreRef.current;
    if (restore?.songId === currentId) { media.currentTime = restore.currentTime; setProgress(restore.currentTime); pendingRestoreRef.current = null; }
    setDuration(mediaDuration);
  };
  const startRandom = async ({ recover = true } = {}) => {
    if (!hasAccess()) return;
    clearRandomBudget();
    if (recover && current && !randomSwitchRef.current) {
      randomSwitchRef.current = { songId: current.songId, currentTime: audio.current?.currentTime || progress, wasPlaying: Boolean(playing), mode: playMode.current, queue: playbackQueue.length ? playbackQueue : activeTracks };
    }
    if (recover && current) { clearMediaDeadline(); audio.current?.pause(); setPlaying(false); setPlaybackState('resolving'); }
    const session = randomSession.current + 1;
    randomSession.current = session;
    if (randomRequest.current) randomRequest.current.abort();
    const controller = new AbortController(); randomRequest.current = controller;
    setPlayMode('random'); setListView('random'); setMobileView('now'); setRandomLoading(true); setSearchState('');
    try {
      const response = await musicRequest('random', randomRequestParams(), controller.signal);
      const payload = await providerPayload(response);
      const tracks = canonicalTracks(payload.tracks).filter((track) => track.binding);
      if (!tracks.length) throw Error();
      if (controller.signal.aborted || session !== randomSession.current) return;
      startRandomBatch(tracks, payload.singer || '');
    } catch (error) {
      if (loginExpired(error)) { stopRandom(); setPlaybackState('paused'); }
      else if (!controller.signal.aborted && session === randomSession.current) {
        const accessDenied = providerDenied(error);
        if (!restoreRandomSwitch(accessDenied ? 'Provider 没有访问权限，已恢复上一首' : '下一首加载失败，已恢复上一首')) { setPlayMode('manual'); showToast(accessDenied ? 'Provider 没有访问权限，请重新配置或联系服务提供方' : '暂时没有可播放的随机歌曲，请重试', accessDenied ? 'warning' : 'error'); }
      }
    } finally {
      if (session === randomSession.current) { randomRequest.current = null; setRandomLoading(false); }
    }
  };
  // Recently played artists to avoid, plus the user's era and language hints. An empty
  // language list is dropped by the proxy, which the Provider reads as no preference.
  function randomRequestParams() { return { exclude: randomSingers.current.join(','), era: randomPreferences.era, languages: randomPreferences.languages.join(',') }; }
  // The current batch keeps playing; only a batch requested ahead with the old preferences is dropped.
  function saveRandomPreferences(change) {
    const next = { ...randomPreferences, ...change };
    updateLibrary((value) => ({ ...value, settings: { ...(value.settings || {}), randomPreferences: next } }));
    randomBatchRef.current.next = null;
  }
  function toggleRandomLanguage(language) {
    if (!language) { saveRandomPreferences({ languages: [] }); return; }
    const languages = randomPreferences.languages.includes(language) ? randomPreferences.languages.filter((item) => item !== language) : [...randomPreferences.languages, language];
    saveRandomPreferences({ languages });
  }
  // One Provider request returns a batch; random play works through it before asking for another.
  // Songs heard recently (the last 50) count as played, so a batch never repeats them.
  function unplayedRandomTracks() { return randomBatchRef.current.tracks.filter((track) => !randomTrackKeys.current.includes(randomTrackKey(track))); }
  function startRandomBatch(tracks, singer = '') {
    randomBatchRef.current.request?.abort();
    randomBatchRef.current = { tracks, next: null, request: null };
    const fresh = unplayedRandomTracks(); const candidates = fresh.length ? fresh : tracks;
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    rememberRandomTrack(selected, singer);
    randomListWriteIdRef.current = selected.songId;
    if (randomSwitchRef.current) randomSwitchRef.current.targetId = selected.songId;
    if (audio.current) { ignoreAudioErrorRef.current = true; audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); }
    setPlaying(false); setProgress(0); setDuration(0);
    playbackListRef.current = 'random'; clearMediaDeadline(); setPlaybackQueue(tracks); historyStartIdRef.current = selected.songId; setCurrentId(selected.songId); beginRandomBudget(selected.songId); setPlaybackTrackId(selected.songId); setPlaybackState('resolving');
  }
  // Ask for the next batch while its last song plays, so the switch does not wait for the Provider.
  function requestNextRandomBatch() {
    const batch = randomBatchRef.current;
    if (!batch.tracks.length || batch.next || batch.request || unplayedRandomTracks().length) return;
    const controller = new AbortController(); batch.request = controller;
    musicRequest('random', randomRequestParams(), controller.signal).then(providerPayload).then((payload) => {
      const tracks = canonicalTracks(payload.tracks).filter((track) => track.binding);
      if (randomBatchRef.current === batch && tracks.length) batch.next = { tracks, singer: payload.singer || '' };
    }).catch(() => { /* The batch is requested again when it runs out. */ }).finally(() => { if (batch.request === controller) batch.request = null; });
  }
  function playNextRandom(message = '', recover = false) {
    if (message) {
      showToast(message, 'warning'); randomFailuresRef.current += 1;
      if (randomFailuresRef.current >= RANDOM_FAILURE_LIMIT) { stopRandom(); setPlaying(false); setPlaybackState('error'); showToast(`连续 ${RANDOM_FAILURE_LIMIT} 首歌曲无法播放，请稍后重试或检查 Provider`, 'error'); return; }
    }
    const unplayed = unplayedRandomTracks();
    if (unplayed.length) {
      const track = unplayed[Math.floor(Math.random() * unplayed.length)];
      rememberRandomTrack(track);
      randomListWriteIdRef.current = track.songId;
      if (randomSwitchRef.current) randomSwitchRef.current.targetId = track.songId;
      playbackListRef.current = 'random';
      // After going back through history the queue holds that history, so put the batch back.
      const inQueue = playbackQueue.some((item) => item.songId === track.songId);
      beginRandomBudget(track.songId); selectTrack(track.songId, inQueue ? null : randomBatchRef.current.tracks, 'random');
      return;
    }
    const ready = randomBatchRef.current.next;
    if (ready) { startRandomBatch(ready.tracks, ready.singer); return; }
    startRandom({ recover });
  }

  const loadChart = async (platform = chartPlatform, type = chartType, refresh = false) => {
    chartRequestRef.current?.abort(); chartRequestRef.current = null;
    const stored = readChartStore(platform, type); const cached = Array.isArray(stored?.tracks) ? stored : null;
    const cachedAt = Date.parse(cached?.updatedAt || ''); const cacheFresh = Number.isFinite(cachedAt) && Date.now() - cachedAt < CHART_CACHE_MAX_AGE_MS;
    if (cached && cacheFresh && !refresh) { setChartData(hydrateChart(cached)); setChartLoading(false); setChartState(''); return; }
    if (!refresh) setChartData(hydrateChart(null));
    if (!hasAccess()) { setChartLoading(false); setChartState(''); return; }
    const controller = new AbortController(); chartRequestRef.current = controller; setChartLoading(true); setChartState(refresh ? '正在刷新榜单…' : '正在加载榜单…');
    try {
      const response = await musicRequest('charts', { platform, chart: type, refresh: refresh ? '1' : '' }, controller.signal);
      const payload = await providerPayload(response);
      if (!Array.isArray(payload.tracks)) throw new Error('榜单服务暂时不可用');
      if (controller.signal.aborted) return;
      try { localStorage.setItem(chartStoreKey(platform, type), JSON.stringify(payload)); } catch { /* Storage is unavailable in private browsing. */ }
      setChartData(hydrateChart(payload)); setChartState(payload.stale ? '榜单更新失败，正在展示上次成功数据' : '');
    } catch {
      if (controller.signal.aborted) return;
      if (cached) { setChartData(hydrateChart(cached)); setChartState('刷新失败，正在展示上次缓存'); }
      else { setChartState('榜单暂时不可用，请稍后重试'); }
    } finally {
      if (chartRequestRef.current === controller) { chartRequestRef.current = null; setChartLoading(false); }
    }
  };
  const openNetease = () => { setChartPlatform('netease'); setListView('netease'); void loadChart('netease', chartType); };
  const openQQ = () => { setChartPlatform('qq'); setListView('qq'); void loadChart('qq', chartType); };
  const selectChartType = (type) => { setChartType(type); void loadChart(chartPlatform, type); };
  useEffect(() => {
    const view = routeView(routePath); setListView(view);
    if (routePath === '/charts') void loadChart(chartPlatform, chartType);
  }, [routePath]);

  const loadResults = async (keyword, page, append = false) => {
    searchRequestRef.current?.abort();
    const controller = new AbortController(); searchRequestRef.current = controller;
    if (append) { loadingMoreRef.current = true; setLoadingMore(true); } else { loadingMoreRef.current = false; setLoadingMore(false); setSearchState(TEXT.searching); }
    try {
      const response = await musicRequest('search', { q: keyword, page }, controller.signal);
      const payload = await providerPayload(response);
      if (controller.signal.aborted || searchRequestRef.current !== controller || activeSearchRef.current !== keyword) return;
      const incoming = canonicalTracks(payload.tracks).filter((track) => track.binding);
      setTracks((items) => append ? [...items, ...incoming.filter((track) => !items.some((item) => item.songId === track.songId))] : incoming.map((track) => ({ ...track, url: undefined })));
      setResults((items) => append ? [...items, ...incoming.filter((track) => !items.some((item) => item.songId === track.songId))] : incoming);
      if (append && playbackListRef.current === `search:${activeSearchRef.current}`) setPlaybackQueue((items) => [...items, ...incoming.filter((track) => !items.some((item) => item.songId === track.songId))]);
      setResultPage(page); setHasMoreResults(Boolean(payload.hasMore && incoming.length)); setSearchState('');
    } catch (error) {
      if (controller.signal.aborted || searchRequestRef.current !== controller || activeSearchRef.current !== keyword) return;
      const accessDenied = providerDenied(error); setHasMoreResults(false); setSearchState(''); if (!loginExpired(error)) showToast(accessDenied ? 'Provider 没有访问权限，请重新配置或联系服务提供方' : '搜索服务暂时不可用', accessDenied ? 'warning' : 'error');
    } finally {
      if (searchRequestRef.current === controller) { searchRequestRef.current = null; loadingMoreRef.current = false; setLoadingMore(false); }
    }
  };
  const runSearch = async (keyword) => {
    if (!hasAccess()) return;
    stopRandom();
    activeSearchRef.current = keyword;
    setRecentSearches((items) => [keyword, ...items.filter((item) => item !== keyword)].slice(0, 10));
    setListView('search'); setResults([]); setResultPage(0); setHasMoreResults(false); await loadResults(keyword, 1);
  };
  const search = async (event) => {
    event.preventDefault(); const keyword = query.trim(); if (!keyword) return;
    setSearchFocused(false); setActiveSingerSuggestion(-1); await runSearch(keyword);
  };
  const chooseSearchSuggestion = (keyword) => { setQuery(keyword); setSearchFocused(false); setActiveSingerSuggestion(-1); runSearch(keyword); };
  const clearSearchInput = () => { setQuery(''); setActiveSingerSuggestion(-1); setSearchFocused(true); searchInputRef.current?.focus(); };
  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') { setSearchFocused(false); setActiveSingerSuggestion(-1); event.currentTarget.blur(); return; }
    if (!searchSuggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSingerSuggestion((index) => (index + 1) % searchSuggestions.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSingerSuggestion((index) => index <= 0 ? searchSuggestions.length - 1 : index - 1); }
    if (event.key === 'Enter' && activeSingerSuggestion >= 0) { event.preventDefault(); chooseSearchSuggestion(searchSuggestions[activeSingerSuggestion]); }
  };
  const loadNextPage = () => {
    const keyword = activeSearchRef.current;
    if (listView !== 'search' || !keyword || !results.length || !hasMoreResults || loadingMoreRef.current) return;
    loadResults(keyword, resultPage + 1, true);
  };
  const loadNextPageRef = useRef(loadNextPage);
  useEffect(() => { loadNextPageRef.current = loadNextPage; });
  // The next page loads when the end of the results comes within 400px of view.
  // Re-observing after each page also fills screens taller than one page.
  useEffect(() => {
    const end = listEndRef.current;
    if (!end || listView !== 'search' || !hasMoreResults || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) loadNextPageRef.current(); }, { root: scrollParentOf(end), rootMargin: '0px 0px 400px 0px' });
    observer.observe(end);
    return () => observer.disconnect();
  }, [listView, hasMoreResults, results.length, loadingMore]);

  const navigate = (path) => { if (onNavigate) onNavigate(path); else { window.history.pushState(null, '', path); setListView(routeView(path)); } };
  const selectedPlaylistId = routePath?.startsWith('/playlists/') ? decodeURIComponent(routePath.slice('/playlists/'.length)) : '';
  const selectedPlaylist = library.playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;
  const closeLibraryDialog = () => { setLibraryDialog(''); setDialogTrackState(null); setDialogPlaylist(null); setNewPlaylistName(''); };
  const createPlaylist = () => { setDialogPlaylist(null); setNewPlaylistName('我的歌单'); setLibraryDialog('create'); };
  const renamePlaylist = (playlist) => { setDialogPlaylist(playlist); setNewPlaylistName(playlist.name); setLibraryDialog('rename'); };
  const deletePlaylist = (playlist) => { setDialogPlaylist(playlist); setLibraryDialog('delete'); };
  const submitPlaylistName = (event) => {
    event.preventDefault();
    const name = safeName(newPlaylistName, ''); if (!name) return;
    const timestamp = new Date().toISOString();
    if (libraryDialog === 'rename' && dialogPlaylist) {
      updateLibrary((value) => ({ ...value, playlists: value.playlists.map((item) => item.id === dialogPlaylist.id ? { ...item, name, updatedAt: timestamp } : item) }));
      closeLibraryDialog(); return;
    }
    const id = globalThis.crypto?.randomUUID?.() || `playlist-${Date.now()}`;
    updateLibrary((value) => ({ ...value, playlists: [...value.playlists, { id, name, tracks: [], createdAt: timestamp, updatedAt: timestamp }].slice(0, 30) }));
    closeLibraryDialog(); navigate(`/playlists/${encodeURIComponent(id)}`);
  };
  const confirmDeletePlaylist = () => {
    const playlist = dialogPlaylist; if (!playlist) return;
    updateLibrary((value) => ({ ...value, playlists: value.playlists.filter((item) => item.id !== playlist.id) }));
    closeLibraryDialog(); navigate('/playlists');
  };
  const openAddToPlaylist = (track) => {
    const selected = library.playlists.filter((playlist) => playlist.tracks.some((item) => samePlaylistTrack(item, track))).map((playlist) => playlist.id);
    setDialogTrack(track); setPlaylistSelection(selected); setNewPlaylistName(''); setLibraryDialog('add');
  };
  const togglePlaylistSelection = (playlistId) => setPlaylistSelection((items) => items.includes(playlistId) ? items.filter((id) => id !== playlistId) : [...items, playlistId]);
  const savePlaylistSelection = () => {
    const snapshot = canonicalTrack(dialogTrack); if (!snapshot) return;
    const selected = new Set(playlistSelection);
    updateLibrary((value) => ({ ...value, playlists: value.playlists.map((playlist) => {
      const exists = playlist.tracks.some((item) => samePlaylistTrack(item, snapshot));
      if (selected.has(playlist.id)) return { ...playlist, tracks: [...playlist.tracks.filter((item) => !samePlaylistTrack(item, snapshot)), snapshot].slice(0, 200), updatedAt: exists ? playlist.updatedAt : new Date().toISOString() };
      if (!exists) return playlist;
      return { ...playlist, tracks: playlist.tracks.filter((item) => !samePlaylistTrack(item, snapshot)), updatedAt: new Date().toISOString() };
    }) }));
    setLibraryDialog(''); setDialogTrack(null); notify?.('歌单已更新', playlistSelection.length ? `已保存到 ${playlistSelection.length} 个歌单` : '已从全部歌单移除', 'success');
  };
  const createPlaylistForTrack = () => {
    const name = safeName(newPlaylistName, ''); const snapshot = canonicalTrack(dialogTrack); if (!name || !snapshot) return;
    const id = globalThis.crypto?.randomUUID?.() || `playlist-${Date.now()}`; const timestamp = new Date().toISOString();
    updateLibrary((value) => ({ ...value, playlists: [...value.playlists, { id, name, tracks: [snapshot], createdAt: timestamp, updatedAt: timestamp }].slice(0, 30) }));
    setLibraryDialog(''); setDialogTrack(null); setNewPlaylistName(''); notify?.('歌单已创建', `“${name}”已加入 ${snapshot.title}`, 'success');
  };
  const removeTrackFromPlaylist = (playlistId, trackId) => updateLibrary((value) => ({ ...value, playlists: value.playlists.map((playlist) => playlist.id !== playlistId ? playlist : { ...playlist, tracks: playlist.tracks.filter((track) => track.songId !== trackId), updatedAt: new Date().toISOString() }) }));
  const recordHistory = (track) => {
    const snapshot = canonicalTrack(track); if (!snapshot) return;
    const now = new Date().toISOString();
    updateLibrary((value) => { const previous = value.history.find((item) => item.songId === snapshot.songId); return { ...value, history: [{ ...snapshot, playedAt: now, playCount: Number(previous?.playCount || 0) + 1 }, ...value.history.filter((item) => item.songId !== snapshot.songId)].slice(0, 200) }; }, { deferSync: true });
  };
  const acceptLocalFiles = (fileList) => {
    const files = [...(fileList || [])].filter((file) => file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i.test(file.name));
    if (!files.length) { notify?.('没有找到音频文件', '请选择常见音频格式', 'warning'); return; }
    const created = files.map(localTrackFromFile); created.forEach((track) => localUrlsRef.current.add(track.url));
    setLocalTracks((items) => [...items, ...created].slice(-500)); notify?.('本地歌曲已载入', `已加入 ${created.length} 首，仅在当前页面会话有效`, 'success'); navigate('/local');
  };
  const importFiles = async (fileList) => {
    const files = [...(fileList || [])]; let imported = 0; let skipped = 0;
    for (const file of files) {
      if (file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i.test(file.name)) { acceptLocalFiles([file]); imported += 1; continue; }
      try {
        const text = await file.text();
        if (/\.json$/i.test(file.name)) {
          const payload = JSON.parse(text); const source = Array.isArray(payload) ? payload : payload.tracks; const songs = canonicalTracks(source);
          if (!songs.length) throw new Error('没有可识别歌曲');
          const id = globalThis.crypto?.randomUUID?.() || `playlist-${Date.now()}-${imported}`; const now = new Date().toISOString();
          updateLibrary((value) => ({ ...value, playlists: [...value.playlists, { id, name: safeName(payload.name || file.name.replace(/\.json$/i, '')), tracks: songs.slice(0, 200), createdAt: now, updatedAt: now }].slice(0, 30) })); imported += songs.length;
        } else if (/\.m3u8?$/i.test(file.name)) {
          const rows = text.split(/\r?\n/); let pendingTitle = ''; const songs = [];
          rows.forEach((row, index) => { const value = row.trim(); if (value.startsWith('#EXTINF:')) { pendingTitle = value.split(',').slice(1).join(',').trim(); return; } if (!value || value.startsWith('#')) return; if (!/^https?:\/\//i.test(value)) { skipped += 1; return; } const title = pendingTitle || `导入歌曲 ${index + 1}`; songs.push({ songId: `local:m3u:${Date.now()}:${index}`, sourceType: 'local', title, artist: '导入播放列表', album: file.name, url: value, art: '', binding: { source: 'local', sourceId: value, meta: {}, art: '' } }); pendingTitle = ''; });
          if (!songs.length) throw new Error('没有可直接播放的网络地址'); setLocalTracks((items) => [...items, ...songs].slice(-500)); imported += songs.length; navigate('/local');
        } else skipped += 1;
      } catch { skipped += 1; }
    }
    notify?.('导入完成', `成功 ${imported} 项，跳过 ${skipped} 项`, imported ? 'success' : 'warning');
  };

  const handleTrackAction = (track) => {
    if (track.songId === currentId) { toggle(); return; }
    const isChartView = listView === 'netease' || listView === 'qq';
    const queue = listView === 'search' ? results : listView === 'likes' ? likedTracks : ['random', 'discover'].includes(listView) ? randomTracks : listView === 'playlist' ? selectedPlaylist?.tracks || [] : listView === 'history' ? library.history : listView === 'local' ? localTracks : isChartView ? chartData.tracks : tracks;
    playbackListRef.current = listView === 'search' ? `search:${activeSearchRef.current}` : isChartView ? `charts:${listView}:${chartType}` : listView;
    setActiveQueue(listView === 'likes' ? 'favorites' : 'normal');
    setSwitchDirection('next'); selectTrack(track.songId, queue);
  };
  const seekLyric = (event) => {
    const line = event.target.closest('p');
    if (!line) return;
    const range = document.createRange(); range.selectNodeContents(line); const bounds = range.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    const index = line ? [...event.currentTarget.querySelectorAll('p')].indexOf(line) : -1;
    const lyric = lyricLines[index];
    if (lyric?.time >= 0 && audio.current) { audio.current.currentTime = lyric.time; setProgress(lyric.time); }
  };

  const isChartView = listView === 'netease' || listView === 'qq';
  const visibleTracks = listView === 'search' ? results : listView === 'likes' ? likedTracks : ['random', 'discover'].includes(listView) ? randomTracks : listView === 'playlist' ? selectedPlaylist?.tracks || [] : listView === 'history' ? library.history : listView === 'local' ? localTracks : isChartView ? chartData.tracks : tracks;
  const rowArt = (track) => usableArt(artOverrides[track?.songId]) || artworkFor(track);
  useEffect(() => {
    // Leaving a list drops its queued cover requests; those songs may be retried later.
    const state = rowArtworkRef.current;
    for (const { track } of state.queue) state.tried.delete(track.songId);
    state.queue = [];
  }, [listView, routePath]);
  const isSearching = searchState === TEXT.searching;
  const isPlaybackBusy = randomLoading || playbackState === 'resolving' || playbackState === 'loading';
  // What the player is doing, shown in place of the artist until the song plays. While random
  // play waits for a new batch, the title says so instead of keeping the previous song.
  const playbackStatus = playbackState === 'resolving' ? (recoveringId === currentId ? '音源失效，正在重新获取…' : '正在获取音源…')
    : playbackState === 'loading' ? '正在缓冲…'
    : playbackState === 'error' ? '无法播放，点击播放按钮重试' : '';
  const shownTitle = randomLoading ? '正在挑选下一首…' : current?.title;
  const shownSubtitle = randomLoading ? '随机播放' : playbackStatus || current?.artist;
  const playbackAnnouncement = randomLoading ? '正在挑选下一首' : playbackStatus;
  const rowPlaybackState = (id) => id === playbackTrackId ? playbackState : 'idle';
  useEffect(() => {
    mediaActionsRef.current = {
      play: () => { pulseControl('play'); if (!playing) toggle(); },
      pause: () => { pulseControl('play'); if (playing) toggle(); },
      previous: () => { pulseControl('previous'); previous(); },
      next: () => { pulseControl('next'); next(); },
      toggle,
    };
  });
  // Dialogs and the full-screen player trap focus and close on Escape. The
  // player yields while a library dialog is stacked on top of it.
  useEffect(() => {
    const panel = libraryDialogRef.current;
    if (!libraryDialog || !panel) return undefined;
    return activateOverlayFocus(panel, () => { setLibraryDialog(''); setDialogTrackState(null); setDialogPlaylist(null); setNewPlaylistName(''); });
  }, [libraryDialog]);
  // The full-screen player owns one history entry (same URL, marked state), so the
  // system back button or edge swipe closes it instead of leaving the page.
  const nowHistoryRef = useRef(false);
  const closeNowPlaying = () => setMobileView('playlist');
  useEffect(() => {
    const open = mobileView === 'now';
    if (open && !nowHistoryRef.current) {
      window.history.pushState({ ...(window.history.state || {}), zhiyinNowPlaying: true }, '');
      nowHistoryRef.current = true;
    } else if (!open && nowHistoryRef.current) {
      nowHistoryRef.current = false;
      if (window.history.state?.zhiyinNowPlaying) window.history.back();
    }
  }, [mobileView]);
  useEffect(() => {
    // A reload keeps the marked entry; it no longer belongs to an open player.
    if (window.history.state?.zhiyinNowPlaying) { const { zhiyinNowPlaying: _marker, ...state } = window.history.state; window.history.replaceState(state, ''); }
    const onPopState = () => {
      if (!nowHistoryRef.current || window.history.state?.zhiyinNowPlaying) return;
      nowHistoryRef.current = false; clearNowDrag(); setMobileView('playlist');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const nowOverlayActive = mobileView === 'now' && !libraryDialog;
  useEffect(() => {
    const panel = nowPanelRef.current;
    if (!nowOverlayActive || !panel) return undefined;
    // Focus the panel itself so Space reaches the playback shortcut instead of
    // activating the first header button.
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return activateOverlayFocus(panel, closeNowPlaying);
  }, [nowOverlayActive]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest?.('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      if (event.code === 'Space') { event.preventDefault(); mediaActionsRef.current.toggle(); return; }
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && audio.current && Number.isFinite(audio.current.duration)) {
        event.preventDefault();
        const target = Math.min(audio.current.duration, Math.max(0, audio.current.currentTime + (event.key === 'ArrowLeft' ? -5 : 5)));
        audio.current.currentTime = target; setProgress(target);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  const viewTitle = listView === 'random' ? '发现音乐' : listView === 'discover' ? '最近发现' : isChartView ? '音乐榜单' : listView === 'search' ? '搜索' : listView === 'likes' ? '我的喜欢' : listView === 'playlists' ? '自定义歌单' : listView === 'playlist' ? selectedPlaylist?.name || '歌单' : listView === 'history' ? '播放历史' : listView === 'local' ? '本地音乐' : listView === 'settings' ? '设置' : '播放列表';
  const viewSubtitle = listView === 'random' ? '从现有曲库随机发现下一首喜欢的歌' : listView === 'discover' ? `${visibleTracks.length} 首 · 随机播放成功的歌曲，最多保留 50 首` : listView === 'local' ? '音频不会上传，关闭页面后需要重新选择' : listView === 'history' ? '最近成功播放的 200 首歌曲' : listView === 'playlists' ? '创建、导入并在多端同步你的歌单' : listView === 'settings' ? '账户、播放与 Provider 设置' : isChartView && chartData.updatedAt ? `${visibleTracks.length} 首歌曲 · 更新于 ${chartUpdatedLabel(chartData.updatedAt)}` : `${visibleTracks.length} 首歌曲`;
  const discoveredCount = Math.max(randomTracks.length, current ? 1 : 0);
  const openDocs = () => window.open('/docs', '_blank', 'noopener,noreferrer');
  const cyclePlayerStyle = () => setPlayerStyle((value) => value === 'classic' ? 'immersive' : 'classic');
  const isLiked = Boolean(current && likedTracks.some((track) => sameFavorite(track, current)));
  const likeButton = (placement) => <button className={`${placement}${isLiked ? ' liked' : ''}`} type="button" disabled={!current || current.sourceType === 'local'} aria-label={isLiked ? '取消收藏' : '收藏歌曲'} aria-pressed={isLiked} onClick={() => current && like(current.songId)}><MusicIcon name="heart" /><span>收藏</span></button>;
  const previewLyric = Math.max(activeLyric, 0);
  // On the cover panel a right swipe drags the whole player away, revealing the
  // list behind it; released far or fast enough it closes, otherwise it springs back.
  const setNowDrag = (offset, animate) => {
    const panel = nowPanelRef.current; if (!panel) return;
    panel.style.transition = animate ? 'transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none';
    panel.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : '';
    panel.classList.toggle('is-dragging', offset > 0);
  };
  const clearNowDrag = () => { const panel = nowPanelRef.current; if (!panel) return; panel.style.transition = ''; panel.style.transform = ''; panel.classList.remove('is-dragging'); };
  const startMobileNowSwipe = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    mobileNowSwipeRef.current = { x: touch.clientX, y: touch.clientY, time: performance.now(), dragging: false };
  };
  const moveMobileNowSwipe = (event) => {
    const start = mobileNowSwipeRef.current; const touch = event.touches?.[0];
    if (!start || !touch || mobileNowPanel !== 'cover') return;
    const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y;
    if (!start.dragging) {
      if (deltaX < 12 || deltaX <= Math.abs(deltaY) * 1.15) return;
      start.dragging = true;
    }
    setNowDrag(Math.max(0, deltaX), false);
  };
  const finishMobileNowSwipe = (event) => {
    const start = mobileNowSwipeRef.current; const touch = event.changedTouches?.[0]; mobileNowSwipeRef.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x; const deltaY = touch.clientY - start.y;
    if (start.dragging) {
      const width = nowPanelRef.current?.clientWidth || window.innerWidth;
      const speed = deltaX / Math.max(1, performance.now() - start.time);
      if (deltaX > width * 0.25 || (deltaX > 40 && speed > 0.5)) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { clearNowDrag(); closeNowPlaying(); return; }
        setNowDrag(width, true);
        window.setTimeout(() => { closeNowPlaying(); clearNowDrag(); }, 240);
      } else setNowDrag(0, true);
      return;
    }
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
    if (deltaX < 0 && mobileNowPanel === 'cover') setMobileNowPanel('lyrics');
    if (deltaX > 0 && mobileNowPanel === 'lyrics') setMobileNowPanel('cover');
  };
  const cancelMobileNowSwipe = () => { if (mobileNowSwipeRef.current?.dragging) setNowDrag(0, true); mobileNowSwipeRef.current = null; };
  const shellNav = [
    ['/', '首页', 'home'], ['/charts', '排行榜', 'chart'], ['/search', '搜索', 'search'],
    ['/favorites', '我的喜欢', 'heart'], ['/playlists', '我的歌单', 'playlist'], ['/history', '播放历史', 'history'], ['/local', '本地音乐', 'folder'],
    ['/settings', '设置', 'settings'],
  ];
  // Wide screens lay rows out as columns; the header only names a duration or date column that has values.
  const renderTrackList = () => { const hasDuration = visibleTracks.some((track) => Number(track.duration) > 0); const hasPlayedAt = visibleTracks.some((track) => track.playedAt); return <div className={`music-app-track-list${hasPlayedAt ? ' has-date' : ''}`} ref={musicListRef}>
    {visibleTracks.length > 0 && <div className="music-app-track music-app-track--head" aria-hidden="true"><div className="music-app-track__main"><span className="music-app-track__index">#</span><span className="music-app-track__head-title">歌名</span><span className="music-app-track__artist">歌手</span><span className="music-app-track__album">专辑</span><span className="music-app-track__length">{hasDuration ? '时长' : ''}</span>{hasPlayedAt && <span className="music-app-track__date">日期</span>}</div><span className="music-app-track__actions" /></div>}
    {visibleTracks.map((track, index) => { const state = rowPlaybackState(track.songId); const isCurrent = track.songId === currentId; const busy = isCurrent && isPlaybackBusy; return <div ref={isCurrent ? currentRowRef : null} key={`${track.songId}:${index}`} className={`music-app-track${isCurrent ? ' is-current' : ''}`}>
      <button className="music-app-track__main" type="button" onClick={() => handleTrackAction(track)} disabled={busy} aria-label={`${track.title}，${state === 'playing' ? '暂停' : '播放'}`}>
        <span className="music-app-track__index">{state === 'loading' || state === 'resolving' ? <span className="music-spinner" /> : state === 'playing' ? <MusicIcon name="pause" /> : String(isChartView ? track.rank || index + 1 : index + 1).padStart(2, '0')}</span>
        <Artwork src={rowArt(track)} loading="lazy" onError={() => requestRowArtwork(track)} onUnavailable={() => requestRowArtwork(track)} /><span className="music-app-track__copy"><span className="music-app-track__title"><b>{track.title}</b>{isCurrent && <QualityBadge track={current} fallbackQuality={playbackQuality} />}</span><span className="music-app-track__meta"><small>{track.artist}{track.album ? ` · ${track.album}` : ''}</small>{Number(track.duration) > 0 && <small className="music-app-track__duration">· {time(Number(track.duration))}</small>}</span></span>
        <span className="music-app-track__artist">{track.artist}</span><span className="music-app-track__album">{track.album}</span>{Number(track.duration) > 0 && <span className="music-app-track__length">{time(Number(track.duration))}</span>}
        {track.playedAt && <time className="music-app-track__date">{new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(track.playedAt))}</time>}
      </button>
      <div className="music-app-track__actions">
        {listView === 'playlist' ? <button type="button" onClick={() => removeTrackFromPlaylist(selectedPlaylist.id, track.songId)} aria-label="从歌单移除">移除</button> : track.sourceType !== 'local' && <button type="button" onClick={() => openAddToPlaylist(track)} aria-label={`将 ${track.title} 加入歌单`} title="加入歌单"><MusicIcon name="playlist" /></button>}
      </div>
    </div>; })}
    {listView === 'search' && hasMoreResults && <div ref={listEndRef} className="music-app-list-end" aria-hidden="true" />}
    {loadingMore && <p className="music-list-status">正在加载更多…</p>}
    {!visibleTracks.length && listView === 'search' && <div className={`music-app-empty${isSearching ? ' is-searching' : ''}`} role="status"><strong>{isSearching ? <><span className="music-spinner" /> {TEXT.searching}</> : resultPage > 0 ? TEXT.noResult : TEXT.searchHint}</strong><span>{isSearching ? '结果返回后会显示在这里' : resultPage > 0 ? '换个关键词再试试' : '输入关键词后，按回车或键盘上的搜索键'}</span></div>}
    {!visibleTracks.length && listView !== 'search' && <div className="music-app-empty"><strong>{isChartView ? chartState || (chartLoading ? '正在加载榜单…' : '暂无榜单数据') : listView === 'discover' ? '还没有发现记录' : '这里还没有歌曲'}</strong><span>{isChartView ? '可以切换榜单或点击刷新' : listView === 'discover' ? '在首页点击随机播放开始探索' : listView === 'local' ? '选择本地音频即可开始播放' : listView === 'playlist' ? '可以从搜索、榜单或历史中加入歌曲' : '播放或添加歌曲后会显示在这里'}</span></div>}
  </div>; };
  return <main className={`music-page music-app-shell view-${listView} mobile-view-${mobileView}${playing ? ' is-playing' : ''}${isSearching ? ' is-searching' : ''}`}>
    <audio ref={audio} onDurationChange={syncPositionState} onSeeked={syncPositionState} onRateChange={syncPositionState} onPlay={() => { setPlaying(true); setPlaybackTrackId(currentId); setPlaybackState('playing'); }} onPause={() => { setPlaying(false); setPlaybackState((state) => state === 'loading' || state === 'resolving' ? state : 'paused'); }} onLoadStart={() => setPlaybackState('loading')} onWaiting={() => { setPlaybackState('loading'); beginMediaDeadline(currentId); }} onPlaying={() => { clearMediaDeadline(); clearRandomBudget(); setRecoveringId(''); failedPlaybackIdsRef.current.clear(); playbackRefreshModesRef.current.delete(currentId); setPlaybackState('playing'); if (current && historyStartIdRef.current === currentId) { historyStartIdRef.current = ''; recordHistory(current); } if (randomListWriteIdRef.current === currentId && current) { rememberRandomListTrack(current); randomListWriteIdRef.current = ''; } if (randomSwitchRef.current?.targetId === currentId) randomSwitchRef.current = null; if (playMode.current === 'random') { randomFailuresRef.current = 0; requestNextRandomBatch(); } }} onError={(event) => { if (ignoreAudioErrorRef.current) { ignoreAudioErrorRef.current = false; return; } clearMediaDeadline(); const mediaError = event.currentTarget.error?.code; handlePlaybackFailure('播放地址无法加载，已自动播放下一首', mediaError === 3 || mediaError === 4 ? 'decode' : 'url'); }} onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)} onLoadedMetadata={handleLoadedMetadata} onEnded={() => { clearMediaDeadline(); next(true); }} />
    <Toast toast={toast} onClose={() => setToast(null)} />
    <div className={`music-artwork-backdrop${activeArtworkBackground ? ' is-visible' : ''}`} style={activeArtworkBackground ? { backgroundImage: `url(${JSON.stringify(activeArtworkBackground)})` } : undefined} aria-hidden="true" />
    <aside className="music-app-sidebar">
      <button className="music-app-brand" type="button" onClick={() => navigate('/')}><img src="/zhiyin-logo.png" alt="" /><span><b>知音</b><small>ZHÍYĪN MUSIC</small></span></button>
      <nav aria-label="音乐主导航">{shellNav.map(([path, label, icon], index) => <button type="button" key={path} className={`${routePath === path || (path === '/' && routePath === '/discover') || (path === '/playlists' && routePath?.startsWith('/playlists/')) ? 'active' : ''}${index === 3 || index === 7 ? ' is-section-start' : ''}`} onClick={() => navigate(path)}><i><MusicIcon name={icon} /></i><span>{label}</span>{path === '/favorites' && <em>{likedTracks.length}</em>}</button>)}</nav>
      <button className="music-app-account" type="button" onClick={() => navigate('/settings')}><span>{user?.name || '访客模式'}</span><small>{activeProvider?.displayName || activeProvider?.name || (user ? '未启用 Provider' : '登录后同步音乐库')}</small></button>
    </aside>
    <section className="music-app-main">
      <header className="music-app-topbar">
        <div><h1>{viewTitle}</h1><p>{viewSubtitle}</p></div>
        <form ref={searchFormRef} className="music-app-search" onSubmit={search}><span className="music-app-search__icon" aria-hidden="true">{isSearching ? <span className="music-spinner" /> : <MusicIcon name="search" />}</span><input ref={searchInputRef} value={query} onFocus={() => setSearchFocused(true)} onChange={(event) => { setQuery(event.target.value); setActiveSingerSuggestion(-1); }} onKeyDown={handleSearchKeyDown} placeholder={TEXT.searchHint} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={searchHistoryOpen} aria-controls="music-app-search-suggestions" aria-activedescendant={activeSingerSuggestion >= 0 ? `music-app-search-option-${activeSingerSuggestion}` : undefined} />{query && <button className="music-app-search__clear" type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearSearchInput} aria-label="清空搜索内容" title="清空"><MusicIcon name="close" /></button>}<button className="music-app-search__submit" type="submit" disabled={isSearching}>{isSearching ? <span className="music-spinner" /> : '搜索'}</button>{searchHistoryOpen && <div className="music-search-history" id="music-app-search-suggestions" ref={searchSuggestionsRef} role="listbox" aria-label={singerSuggestions.length ? '歌手建议' : '最近搜索'} onMouseDown={(event) => event.preventDefault()}><div className="music-search-history__head"><span>{singerSuggestions.length ? '歌手建议' : '最近搜索'}</span>{!singerSuggestions.length && <button type="button" onClick={() => { setRecentSearches([]); setActiveSingerSuggestion(-1); }}>清除记录</button>}</div><div className="music-search-history__list">{searchSuggestions.map((item, index) => <button className={`music-search-history__item${index === activeSingerSuggestion ? ' active' : ''}`} id={`music-app-search-option-${index}`} role="option" aria-selected={index === activeSingerSuggestion} type="button" key={item} onClick={() => chooseSearchSuggestion(item)}><i aria-hidden="true"><MusicIcon name={singerSuggestions.length ? 'search' : 'history'} /></i><span>{item}</span></button>)}</div></div>}</form>
      </header>
      <section className="music-app-body">
        <div className="music-app-page">
          {listView === 'random' && <section className="music-app-home"><header><span>FOR YOU</span><h2>Hi，今天听点什么</h2><p>不知道听什么的时候，交给随机播放。</p></header><section className="music-app-home-feature"><div className="music-app-cover-mosaic">{(randomTracks.length ? randomTracks : [current].filter(Boolean)).slice(0, 4).map((track, index) => <Artwork src={rowArt(track)} key={`${track?.songId || 'empty'}:${index}`} onError={() => requestRowArtwork(track)} onUnavailable={() => requestRowArtwork(track)} />)}{!randomTracks.length && !current && <Artwork src="" />}</div><div className="music-app-home-copy"><span>为你发现</span><h3>随机精选{discoveredCount ? ` · ${discoveredCount} 首` : ''}</h3>{randomMode && current ? <p className="music-app-home-now"><span>正在播放：</span><PlayerTitle className="music-app-home-now__title">{[current.title, current.artist].filter(Boolean).join(' - ')}</PlayerTitle></p> : <p>每次点击都会从曲库中随机挑选一首歌开始播放。</p>}<ul>{randomTracks.slice(0, 3).map((track) => <li key={track.songId}><b>{track.title}</b><span>{track.artist}</span></li>)}</ul><div><button className="music-app-primary" type="button" onClick={startRandom} disabled={randomLoading}>{randomLoading ? <span className="music-spinner" /> : <MusicIcon name="play" />} 随机播放</button></div></div></section><div className="music-app-home-section-title"><div><h3>最近发现</h3><p>随机播放成功的歌曲会保留在这里</p></div>{randomTracks.length > HOME_DISCOVERED_PHONE && <button className="music-app-quiet" type="button" onClick={() => navigate('/discover')}>查看全部 {randomTracks.length}</button>}</div><div className="music-app-home-cards">{randomTracks.slice(0, HOME_DISCOVERED_DESKTOP).map((track) => <button type="button" key={track.songId} onClick={() => handleTrackAction(track)}><Artwork src={rowArt(track)} onError={() => requestRowArtwork(track)} onUnavailable={() => requestRowArtwork(track)} /><b>{track.title}</b><span>{track.artist}</span></button>)}{!randomTracks.length && <div className="music-app-empty"><strong>还没有发现记录</strong><span>点击“随机播放”开始探索。</span></div>}</div></section>}
          {isChartView && <div className="music-app-toolbar"><div className="music-app-segment"><button className={chartPlatform === 'netease' ? 'active' : ''} type="button" onClick={openNetease}>网易</button><button className={chartPlatform === 'qq' ? 'active' : ''} type="button" onClick={openQQ}>QQ</button></div><div className="music-app-segment">{CHART_TYPES.map((chart) => <button className={chartType === chart.value ? 'active' : ''} type="button" onClick={() => selectChartType(chart.value)} key={chart.value}>{chart.label}</button>)}</div><button className="music-app-quiet" type="button" onClick={() => loadChart(chartPlatform, chartType, true)} disabled={chartLoading}>刷新</button></div>}
          {listView === 'playlists' && <><div className="music-app-toolbar"><button className="music-app-primary" type="button" onClick={() => createPlaylist()}>新建歌单</button><button className="music-app-quiet" type="button" onClick={() => importRef.current?.click()}>导入</button><span className="music-app-sync">{syncState === 'synced' ? '已同步' : syncState === 'syncing' ? '同步中' : syncState === 'pending' ? '等待同步' : '仅本机'}</span></div><div className="music-app-playlists"><article className="music-app-playlist-pinned"><button type="button" onClick={() => navigate('/favorites')}><span><MusicIcon name="heart" /></span><b>我的喜欢</b><small>{likedTracks.length} 首歌曲</small></button></article>{library.playlists.map((playlist) => <article key={playlist.id}><button type="button" onClick={() => navigate(`/playlists/${encodeURIComponent(playlist.id)}`)}><span><MusicIcon name="playlist" /></span><b>{playlist.name}</b><small>{playlist.tracks.length} 首歌曲</small></button><div><button type="button" onClick={() => renamePlaylist(playlist)}>重命名</button><button type="button" onClick={() => deletePlaylist(playlist)}>删除</button></div></article>)}{!library.playlists.length && <div className="music-app-empty"><strong>创建你的第一张歌单</strong><span>歌单会随账户在多端同步，音频文件本身不会上传。</span></div>}</div></>}
          {listView === 'discover' && <div className="music-app-toolbar music-app-library-back"><button className="music-app-quiet music-app-back-button" type="button" onClick={() => navigate('/')}><MusicIcon name="back" /><span>返回首页</span></button></div>}
          {['likes', 'history', 'local'].includes(listView) && <div className="music-app-toolbar music-app-library-back"><button className="music-app-quiet music-app-back-button" type="button" onClick={() => navigate('/playlists')}><MusicIcon name="back" /><span>返回音乐库</span></button></div>}
          {listView === 'playlist' && selectedPlaylist && <div className="music-app-toolbar music-app-playlist-toolbar"><button className="music-app-quiet music-app-back-button" type="button" onClick={() => navigate('/playlists')}><MusicIcon name="back" /><span>返回音乐库</span></button><button className="music-app-primary" type="button" disabled={!selectedPlaylist.tracks.length} onClick={() => selectTrack(selectedPlaylist.tracks[0]?.songId, selectedPlaylist.tracks)}>播放全部</button><button className="music-app-quiet" type="button" onClick={() => renamePlaylist(selectedPlaylist)}>重命名</button><button className="music-app-quiet danger" type="button" onClick={() => deletePlaylist(selectedPlaylist)}>删除</button></div>}
          {listView === 'local' && <div className="music-app-local-note"><div><b>播放此设备上的音乐</b><span>桌面端可选择整个文件夹；Android 建议选择一个或多个音频文件。不会上传、缓存或跨设备同步。</span></div><button className="music-app-primary" type="button" onClick={() => localFilesRef.current?.click()}>选择歌曲</button><button className="music-app-quiet music-app-folder-button" type="button" onClick={() => localFolderRef.current?.click()}>选择文件夹</button></div>}
          {listView === 'settings' && <div className="music-app-settings">
            <section className="music-app-settings__account" aria-labelledby="music-account-title">
              <div className="music-app-settings__profile"><span className="music-app-settings__avatar" aria-hidden="true">{user ? Array.from(user.name || '?')[0] : '访'}</span><div><h2 id="music-account-title">{accountBooting ? '正在恢复账户…' : user ? user.name : '访客模式'}</h2><p>{accountBooting ? '账户状态同步完成后即可使用在线功能' : user ? [user.email, SYNC_STATE_LABELS[syncState]].filter(Boolean).join(' · ') : '登录后可同步音乐库，并配置 Provider 与播放音质。本机数据不会同步到其他设备。'}</p></div></div>
              {!accountBooting && !user && <button className="music-app-settings__primary" type="button" onClick={() => onOpenAuth?.()}>登录 / 注册</button>}
              {user && <div className="music-app-settings__rows"><button type="button" onClick={() => onOpenSettings?.('password')}><b>修改密码</b><span>修改后其他设备需要重新登录</span></button><button className="danger" type="button" onClick={() => onLogout?.()}><b>退出登录</b><span>退出当前设备</span></button></div>}
            </section>
            {user && <section aria-labelledby="music-playback-title"><h2 id="music-playback-title">播放</h2><div className="music-app-settings__rows"><button type="button" onClick={() => onOpenSettings?.('quality')}><b>播放音质</b><span>{QUALITY_META[playbackQuality]?.label || playbackQuality}</span></button><button type="button" onClick={() => onOpenSettings?.('providers')}><b>Provider 配置</b><span>{activeProvider?.displayName || '未启用'}</span></button></div></section>}
            <section className="music-app-settings__random" aria-labelledby="music-random-title">
              <div><h2 id="music-random-title">随机播放偏好</h2><p>首页随机播放按这里的偏好挑歌，其他年代和语言的歌仍会少量出现。</p></div>
              <div className="music-app-settings__choice"><b id="music-random-era">歌曲年代</b><div className="music-app-choice-group" role="group" aria-labelledby="music-random-era">{RANDOM_ERA_OPTIONS.map(([value, label]) => <button type="button" key={value} className={randomPreferences.era === value ? 'active' : ''} aria-pressed={randomPreferences.era === value} onClick={() => saveRandomPreferences({ era: value })}>{label}</button>)}</div></div>
              <div className="music-app-settings__choice"><b id="music-random-languages">优先语言</b><div className="music-app-choice-group" role="group" aria-labelledby="music-random-languages">{[['', '不限'], ...RANDOM_LANGUAGE_OPTIONS].map(([value, label]) => { const active = value ? randomPreferences.languages.includes(value) : !randomPreferences.languages.length; return <button type="button" key={value || 'any'} className={active ? 'active' : ''} aria-pressed={active} onClick={() => toggleRandomLanguage(value)}>{label}</button>; })}</div></div>
            </section>
            <section className="music-app-settings__themes" aria-labelledby="music-theme-title"><div><h2 id="music-theme-title">界面主题</h2><p>三套主题共用同一布局，切换后立即保存到当前浏览器。</p></div><div className="music-theme-options">{[['light', '白色', '明亮、清晰'], ['dark', '黑色', '高对比、低干扰'], ['glass', '透明模糊', '封面背景、轻度毛玻璃']].map(([value, label, description]) => <button className={theme === value ? 'active' : ''} type="button" key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}><i className={`music-theme-preview is-${value}`} aria-hidden="true" /><span><b>{label}</b><small>{description}</small></span></button>)}</div></section>
            <section aria-labelledby="music-about-title"><h2 id="music-about-title">关于</h2><div className="music-app-settings__rows"><button type="button" onClick={() => onOpenAnnouncement?.()}><b>网站公告</b><span>查看最新公告</span></button><button type="button" onClick={() => onOpenSettings?.('terms')}><b>使用条款</b><span>服务与隐私说明</span></button>{docsEnabled && <button type="button" onClick={openDocs}><b>帮助与文档</b><span>在新标签页打开</span></button>}</div></section>
          </div>}
          {!['playlists', 'settings', 'random'].includes(listView) && renderTrackList()}
          {listView === 'playlist' && !selectedPlaylist && <div className="music-app-empty"><strong>歌单不存在</strong><button type="button" onClick={() => navigate('/playlists')}>返回歌单</button></div>}
        </div>
        <aside className={`music-app-now is-${playerStyle}${mobileView === 'now' ? ' is-open' : ''}${mobileNowPanel === 'lyrics' ? ' show-lyrics' : ''}`} ref={nowPanelRef} tabIndex={-1} aria-label="正在播放"><div className="music-app-now__backdrop" style={usableArt(current?.art) ? { backgroundImage: `url(${JSON.stringify(current.art)})` } : undefined} aria-hidden="true" /><header className="music-app-now__header"><button type="button" onClick={closeNowPlaying} aria-label="返回音乐列表"><MusicIcon name="back" /></button><span className="music-app-now__title">正在播放</span><div className="music-app-now__lyrics-toggle" role="group" aria-label="切换封面和歌词"><button type="button" aria-pressed={mobileNowPanel === 'cover'} onClick={() => setMobileNowPanel('cover')}>封面</button><button type="button" aria-pressed={mobileNowPanel === 'lyrics'} onClick={() => setMobileNowPanel('lyrics')}>歌词</button></div><button type="button" onClick={cyclePlayerStyle} aria-label={playerStyle === 'classic' ? '切换为沉浸封面样式' : '切换为唱片样式'} title={playerStyle === 'classic' ? '沉浸封面样式' : '唱片样式'}><MusicIcon name="disc" /></button></header><div className="music-app-now__stage" onTouchStart={startMobileNowSwipe} onTouchMove={moveMobileNowSwipe} onTouchEnd={finishMobileNowSwipe} onTouchCancel={cancelMobileNowSwipe}><section className="music-app-now__media"><div className="music-app-now__visual"><Artwork key={`cover:${currentId}`} data-switch={switchDirection} className="music-app-now__cover" src={usableArt(current?.art)} onLoad={artworkLoaded} onError={refreshArtwork} /></div><div key={`meta:${currentId}`} data-switch={switchDirection} className="music-app-now__meta"><h2><span>{shownTitle || '选择一首歌曲'}</span><QualityBadge track={current} fallbackQuality={playbackQuality} /></h2><p className={randomLoading || playbackStatus ? 'is-status' : undefined}>{shownSubtitle || '知音'}</p><small>{current?.album || ''}</small></div><button className="music-app-now__lyric-preview" type="button" onClick={() => setMobileNowPanel('lyrics')} aria-label="查看完整歌词">{lyricLines.length ? <><span key={previewLyric} className={activeLyric >= 0 ? 'is-current' : ''}>{lyricLines[previewLyric]?.text}</span><span key={`next:${previewLyric}`}>{lyricLines[previewLyric + 1]?.text || '\u00a0'}</span></> : <><span className="is-placeholder">{lyricsState || '暂无歌词'}</span><span aria-hidden="true">{'\u00a0'}</span></>}</button></section><div ref={lyricsRef} className="lyrics-body" onClick={seekLyric}>{lyricLines.length ? lyricLines.map((line, index) => <p key={`${line.time}:${line.text}:${index}`}><span>{line.text}</span>{line.translation && <small>{line.translation}</small>}</p>) : <p className="lyrics-empty">{lyricsState || TEXT.choose}</p>}</div></div><footer className="music-app-now__transport"><div className={`music-app-now__seek${isPlaybackBusy ? ' is-pending' : ''}`}><input type="range" min="0" max={duration || 0} value={Math.min(progress, duration || 0)} onChange={(event) => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setProgress(value); }} /><span>{time(progress)}</span><span>{time(duration)}</span></div><div className="music-app-now__footer-song"><Artwork src={usableArt(current?.art)} /><span><b>{shownTitle || TEXT.noTrack}</b><small className={randomLoading || playbackStatus ? 'is-status' : undefined}>{shownSubtitle || '知音'}</small></span></div><div className="music-app-now__controls"><button type="button" onClick={cyclePlaybackMode} aria-label={PLAYBACK_MODE_META[playbackMode].label}><MusicIcon name={PLAYBACK_MODE_META[playbackMode].icon} /></button><button type="button" data-control="previous" onClick={(event) => { pressFeedback(event.currentTarget); previous(); }} aria-label="上一首"><MusicIcon name="previous" /></button><button className="play" type="button" data-control="play" onClick={(event) => { pressFeedback(event.currentTarget); toggle(); }} disabled={isPlaybackBusy} aria-label={playing ? '暂停' : '播放'}>{isPlaybackBusy ? <span className="music-spinner" /> : <MusicIcon name={playing ? 'pause' : 'play'} />}</button><button type="button" data-control="next" onClick={(event) => { pressFeedback(event.currentTarget); next(); }} aria-label="下一首"><MusicIcon name="next" /></button>{likeButton('music-app-now__like--controls')}</div><div className="music-app-now__actions"><DownloadButton track={current} notify={notify} />{likeButton('music-app-now__like--actions')}{current?.sourceType !== 'local' && <button type="button" disabled={!current} aria-label="加入歌单" onClick={() => { setDialogTrack(current); setLibraryDialog('add'); }}><MusicIcon name="playlist" /><span>加入歌单</span></button>}</div></footer></aside>
      </section>
    </section>
    <footer className="music-player music-app-player"><span className="music-visually-hidden" role="status">{playbackAnnouncement}</span><div className={`music-player__progress${isPlaybackBusy ? ' is-pending' : ''}`}><input type="range" min="0" max={duration || 0} value={Math.min(progress, duration || 0)} onChange={(event) => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setProgress(value); }} /></div><div className="music-player__info"><button className="music-player__song" type="button" onClick={() => setMobileView('now')}><Artwork key={`art:${currentId}`} data-switch={switchDirection} src={usableArt(current?.art)} /><span key={`copy:${currentId}`} data-switch={switchDirection} className="music-player__copy"><span className="music-player__heading"><PlayerTitle>{shownTitle || TEXT.noTrack}</PlayerTitle><QualityBadge track={current} fallbackQuality={playbackQuality} /></span><small className={randomLoading || playbackStatus ? 'is-status' : undefined}><span className="music-player__artist">{shownSubtitle || '知音'}</span>{current && <span className="music-player__subtitle-time">· {time(progress)} / {Number.isFinite(duration) && duration > 0 ? time(duration) : '--:--'}</span>}</small></span></button>{current && <span className="music-player__time" role="group" aria-label={`\u5f53\u524d\u65f6\u957f ${time(progress)}\uff0c\u603b\u65f6\u957f ${Number.isFinite(duration) && duration > 0 ? time(duration) : '\u672a\u77e5'}`}><span aria-hidden="true">{time(progress)}</span><span className="music-player__time-separator" aria-hidden="true">/</span><span aria-hidden="true">{Number.isFinite(duration) && duration > 0 ? time(duration) : '--:--'}</span></span>}</div><div className="music-controls"><button className="music-icon-button music-player__previous" type="button" data-control="previous" onClick={(event) => { pressFeedback(event.currentTarget); previous(); }} aria-label="上一首"><MusicIcon name="previous" /></button><button className="music-icon-button play-button" type="button" data-control="play" onClick={(event) => { pressFeedback(event.currentTarget); toggle(); }} disabled={isPlaybackBusy}>{isPlaybackBusy ? <span className="music-spinner" /> : <MusicIcon name={playing ? 'pause' : 'play'} />}</button><button className="music-icon-button music-player__next" type="button" data-control="next" onClick={(event) => { pressFeedback(event.currentTarget); next(); }} aria-label="下一首"><MusicIcon name="next" /></button></div><div className="music-player__utilities"><button className={`music-icon-button music-player__mode music-playback-mode music-playback-mode--${playbackMode}`} type="button" onClick={cyclePlaybackMode} aria-label={PLAYBACK_MODE_META[playbackMode].label}><MusicIcon name={PLAYBACK_MODE_META[playbackMode].icon} /></button><div className="music-volume"><button className="music-icon-button" type="button" onClick={() => setMuted((value) => !value)} aria-label={muted || volume === 0 ? '取消静音' : '静音'}><MusicIcon name={muted || volume === 0 ? 'mute' : 'volume'} /></button><input type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} aria-label="音量" onChange={(event) => { const value = Number(event.target.value); setVolume(value); setMuted(value === 0); }} /></div><DownloadButton track={current} notify={notify} /><button className="music-player__lyrics-button" type="button" aria-label="打开正在播放" onClick={() => setMobileView('now')}>词</button></div></footer>
    <nav className="music-app-mobile-nav" aria-label="移动端主导航">{[['/', '首页', 'home'], ['/charts', '榜单', 'chart'], ['/search', '搜索', 'search'], ['/playlists', '音乐库', 'playlist'], ['/settings', '我的', 'settings']].map(([path, label, icon]) => <button type="button" className={routePath === path || (path === '/' && routePath === '/discover') || (path === '/playlists' && ['/favorites', '/playlists', '/history', '/local'].some((prefix) => routePath?.startsWith(prefix))) ? 'active' : ''} onClick={() => navigate(path)} key={path}><MusicIcon name={icon} /><span>{label}</span></button>)}</nav>
    <input ref={localFilesRef} className="music-visually-hidden" type="file" accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus" multiple onChange={(event) => { acceptLocalFiles(event.target.files); event.target.value = ''; }} />
    <input ref={localFolderRef} className="music-visually-hidden" type="file" accept="audio/*" multiple webkitdirectory="" directory="" onChange={(event) => { acceptLocalFiles(event.target.files); event.target.value = ''; }} />
    <input ref={importRef} className="music-visually-hidden" type="file" accept=".json,.m3u,.m3u8,audio/*" multiple onChange={(event) => { void importFiles(event.target.files); event.target.value = ''; }} />
    {libraryDialog === 'add' && <div className="music-app-modal" ref={libraryDialogRef} role="dialog" aria-modal="true" aria-label="管理所属歌单"><div className="music-app-modal__backdrop" onClick={closeLibraryDialog} aria-hidden="true" /><section><header><div><h2>加入歌单</h2><p>选择后统一保存，可同时加入多个歌单</p></div><button type="button" onClick={closeLibraryDialog} aria-label="关闭"><MusicIcon name="close" /></button></header><div className="music-app-modal__track"><Artwork src={artworkFor(dialogTrack)} /><span><b>{dialogTrack?.title || '当前歌曲'}</b><small>{dialogTrack?.artist || '知音'}</small></span></div><div className="music-app-modal__playlist-list">{library.playlists.map((playlist) => { const selected = playlistSelection.includes(playlist.id); return <button className={selected ? 'is-selected' : ''} type="button" key={playlist.id} aria-pressed={selected} onClick={() => togglePlaylistSelection(playlist.id)}><i aria-hidden="true">{selected ? '✓' : ''}</i><span><b>{playlist.name}</b><small>{playlist.tracks.length} 首歌曲{playlist.tracks.some((track) => track.songId === dialogTrack?.songId) ? ' · 已加入' : ''}</small></span></button>; })}{!library.playlists.length && <div className="music-app-modal__empty"><b>还没有自定义歌单</b><span>在下方输入名称，即可创建并加入当前歌曲。</span></div>}</div><footer><div className="music-app-modal__create"><input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} maxLength="60" placeholder="新歌单名称" aria-label="新歌单名称" /><button type="button" disabled={!newPlaylistName.trim()} onClick={createPlaylistForTrack}>新建并加入</button></div><button className="music-app-primary music-app-modal__save" type="button" onClick={savePlaylistSelection}>保存到 {playlistSelection.length} 个歌单</button></footer></section></div>}
    {(libraryDialog === 'create' || libraryDialog === 'rename') && <div className="music-app-modal" ref={libraryDialogRef} role="dialog" aria-modal="true" aria-labelledby="music-app-playlist-name-title"><div className="music-app-modal__backdrop" onClick={closeLibraryDialog} aria-hidden="true" /><section><form className="music-app-modal__name-form" onSubmit={submitPlaylistName}><header><div><h2 id="music-app-playlist-name-title">{libraryDialog === 'rename' ? '重命名歌单' : '新建歌单'}</h2><p>{libraryDialog === 'rename' ? '新名称会同步到登录的其他设备' : '创建后可以从搜索、榜单或历史中加入歌曲'}</p></div><button type="button" onClick={closeLibraryDialog} aria-label="关闭"><MusicIcon name="close" /></button></header><footer><input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} onFocus={(event) => event.currentTarget.select()} maxLength="60" placeholder="歌单名称" aria-label="歌单名称" autoFocus /><button className="music-app-primary music-app-modal__save" type="submit" disabled={!newPlaylistName.trim()}>{libraryDialog === 'rename' ? '保存' : '创建歌单'}</button></footer></form></section></div>}
    <ConfirmDialog open={libraryDialog === 'delete' && Boolean(dialogPlaylist)} title="删除歌单" message={`确定删除「${dialogPlaylist?.name || ''}」吗？歌单内的歌曲记录会一起移除，此操作无法撤销。`} confirmLabel="删除" tone="warning" onConfirm={confirmDeletePlaylist} onCancel={closeLibraryDialog} />
  </main>;
}
