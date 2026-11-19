import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/pages/MusicQ.css', import.meta.url), 'utf8');
const player = readFileSync(new URL('../src/styles/player.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('the app player separates transport controls from desktop utilities', () => {
  const footer = music.slice(
    music.indexOf('<footer className="music-player music-app-player">'),
    music.indexOf('</footer>', music.indexOf('<footer className="music-player music-app-player">')),
  );
  const controls = footer.slice(footer.indexOf('<div className="music-controls">'), footer.indexOf('<div className="music-player__utilities">'));
  const utilities = footer.slice(footer.indexOf('<div className="music-player__utilities">'));

  assert.doesNotMatch(controls, /music-player__mode|music-volume/);
  assert.match(utilities, /music-player__mode/);
  assert.match(utilities, /music-volume/);
  assert.match(utilities, /<DownloadButton track=\{current\}/);
  assert.match(utilities, /music-player__lyrics-button/);
});

test('quality badges appear only for the current track and sit beside its title', () => {
  assert.match(music, /music-app-track__title[\s\S]*?\{isCurrent && <QualityBadge track=\{current\} fallbackQuality=\{playbackQuality\}/);
  assert.doesNotMatch(music, /QualityBadge track=\{isCurrent \? current : track\}/);
  assert.match(music, /music-player__heading[\s\S]*?<PlayerTitle>[\s\S]*?<QualityBadge track=\{current\} fallbackQuality=\{playbackQuality\}/);
  assert.match(music, /music-app-now__meta"><h2><span>[\s\S]*?<QualityBadge track=\{current\} fallbackQuality=\{playbackQuality\}/);
  assert.match(music, /if \(!track \|\| track\.sourceType === 'local'\) return null/);
});

test('mobile library exposes favorites and playlist detail has a clear back path', () => {
  assert.match(music, /music-app-playlist-pinned[\s\S]*?navigate\('\/favorites'\)[\s\S]*?我的喜欢[\s\S]*?likedTracks\.length/);
  assert.match(music, /music-app-playlist-toolbar[\s\S]*?music-app-back-button[\s\S]*?navigate\('\/playlists'\)[\s\S]*?返回音乐库/);
  assert.match(layout, /\.music-app-shell\.view-playlist \.music-app-playlist-toolbar[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test('mobile typography is compact and player quality follows the title width', () => {
  assert.match(player, /\.music-app-player \.music-player__title \{[^}]*flex: 0 1 auto;/);
  assert.match(layout, /@media \(max-width: 700px\)[\s\S]*?\.music-app-topbar h1[\s\S]*?font-size: 1\.08rem !important/);
  assert.match(player, /\.music-app-now__meta h2 \{[^}]*font-size: clamp\(1\.15rem, 5\.1vw, 1\.48rem\);/);
});

test('both players live in one stylesheet that loads last and needs no !important', () => {
  assert.match(app, /import '\.\/brand-theme\.css';\n[^\n]*\nimport '\.\/styles\/player\.css';/, 'player.css must follow every other stylesheet');
  assert.doesNotMatch(player.replace(/\/\*[\s\S]*?\*\//g, ''), /!important/);
  for (const name of ['Music.css', 'MusicQ.css']) {
    const css = readFileSync(new URL(`../src/pages/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(css, /\.(?:music-app-player|music-app-now|music-player__[\w-]+|music-controls|music-volume)\b/, `${name} must not style the players`);
  }
  const breakpoints = new Set([...player.matchAll(/\((?:max|min)-width: (\d+)px\)/g)].map((match) => match[1]));
  assert.deepEqual([...breakpoints].sort(), ['1040', '1180', '390', '700', '701'], 'Players share the app breakpoints');
});

test('desktop and mobile players use independent progress rows and non-overlapping lanes', () => {
  assert.match(player, /\.music-app-player \{[^}]*grid-template-columns: 310px minmax\(360px, 1fr\) 260px;[^}]*grid-template-rows: minmax\(0, 1fr\) 10px;/);
  assert.match(player, /\.music-app-player \.music-player__progress \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 2;/);
  assert.match(player, /@media \(max-width: 700px\) \{\s*\.music-app-player \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto 44px;[^}]*grid-template-rows: 5px minmax\(0, 1fr\);/);
  assert.match(player, /\.music-app-player \.music-player__progress \{\s*grid-row: 1;/);
});

test('mobile now-playing switches between artwork and lyrics by swipe or the header control', () => {
  const nowPlayer = music.slice(music.indexOf('<aside className={`music-app-now'), music.indexOf('</aside>', music.indexOf('<aside className={`music-app-now')));
  assert.match(music, /const startMobileNowSwipe/);
  assert.match(music, /Math\.abs\(deltaX\) < 48/);
  assert.match(nowPlayer, /onTouchStart=\{startMobileNowSwipe\}/);
  assert.match(nowPlayer, /onTouchEnd=\{finishMobileNowSwipe\}/);
  assert.match(nowPlayer, /className="music-app-now__lyrics-toggle" role="group"[\s\S]*?aria-pressed=\{mobileNowPanel === 'cover'\}[\s\S]*?aria-pressed=\{mobileNowPanel === 'lyrics'\}/);
  assert.doesNotMatch(nowPlayer, /name="queue"/);
  assert.match(player, /\.music-app-now__lyrics-toggle \{\s*display: none;/, 'Desktop shows artwork and lyrics side by side');
  assert.match(player, /@media \(max-width: 700px\) \{[\s\S]*?\.music-app-now__lyrics-toggle \{ display: inline-flex; \}/);
  assert.match(player, /grid-template-areas:\s*"actions"\s*"seek"\s*"controls"/);
  // Both panels stay mounted and cross-fade; the transport is identical on both, so nothing moves.
  assert.match(player, /\.music-app-now\.show-lyrics \.music-app-now__media \{[^}]*opacity: 0;[^}]*visibility: hidden;/);
  assert.match(player, /\.music-app-now\.show-lyrics \.lyrics-body \{[^}]*opacity: 1;[^}]*visibility: visible;/);
  assert.match(player, /\.music-app-now\.show-lyrics \.lyrics-body \{ transition: opacity 0\.34s ease 0\.08s/, 'The incoming panel waits for the outgoing one');
  assert.doesNotMatch(player, /\.show-lyrics \.music-app-now__(?:transport|actions)/, 'Switching panels must not resize the transport');
});

test('a right swipe on the phone cover drags the player away and closes it', () => {
  const nowPlayer = music.slice(music.indexOf('<aside className={`music-app-now'), music.indexOf('</aside>', music.indexOf('<aside className={`music-app-now')));
  assert.match(nowPlayer, /onTouchMove=\{moveMobileNowSwipe\}[\s\S]*?onTouchCancel=\{cancelMobileNowSwipe\}/);
  assert.match(music, /const moveMobileNowSwipe = [\s\S]*?mobileNowPanel !== 'cover'\) return;[\s\S]*?deltaX <= Math\.abs\(deltaY\) \* 1\.15\) return;/, 'Only horizontal right drags on the cover panel move the player');
  assert.match(music, /if \(deltaX > width \* 0\.25 \|\| \(deltaX > 40 && speed > 0\.5\)\)/, 'A quarter of the width or a quick flick closes it; anything less springs back');
  assert.match(player, /\.music-app-now\.is-dragging \{[^}]*box-shadow:/);
});

test('the full-screen player owns a history entry so system back closes it', () => {
  assert.match(music, /window\.history\.pushState\(\{ \.\.\.\(window\.history\.state \|\| \{\}\), zhiyinNowPlaying: true \}, ''\);/, 'Opening adds an entry with the same URL');
  assert.match(music, /if \(window\.history\.state\?\.zhiyinNowPlaying\) window\.history\.back\(\);/, 'Closing in the page consumes that entry');
  assert.match(music, /const onPopState = \(\) => \{\s*if \(!nowHistoryRef\.current \|\| window\.history\.state\?\.zhiyinNowPlaying\) return;[\s\S]*?setMobileView\('playlist'\);/, 'System back closes the player');
  assert.match(music, /<header className="music-app-now__header"><button type="button" onClick=\{closeNowPlaying\}/);
});

test('phone transport centres play between four equal slots', () => {
  const controls = music.slice(music.indexOf('<div className="music-app-now__controls">'), music.indexOf('<div className="music-app-now__actions">'));
  assert.equal((controls.match(/<button /g) || []).length + (controls.match(/likeButton\(/g) || []).length, 5, 'mode, previous, play, next, favourite');
  assert.match(player, /\.music-app-now__controls \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
});

test('the phone lyric preview always takes two lines, so switching songs never moves the cover', () => {
  const preview = music.slice(music.indexOf('className="music-app-now__lyric-preview"'), music.indexOf('</button>', music.indexOf('className="music-app-now__lyric-preview"')));
  assert.match(preview, /lyricLines\[previewLyric \+ 1\]\?\.text \|\| '\\u00a0'/, 'The last line keeps an empty second line');
  assert.match(preview, /<span className="is-placeholder">\{lyricsState \|\| '暂无歌词'\}<\/span><span aria-hidden="true">\{'\\u00a0'\}<\/span>/, 'Loading and no-lyrics messages keep two lines');
  assert.match(player, /\.music-app-now__lyric-preview \.is-placeholder \{ font-size: 1rem; \}/, 'The message line is as tall as the playing line');
});

test('phone cover view previews the playing and next lyric lines', () => {
  assert.match(music, /className="music-app-now__lyric-preview"[\s\S]*?lyricLines\[previewLyric\]\?\.text[\s\S]*?lyricLines\[previewLyric \+ 1\]\?\.text/);
  assert.match(player, /\.music-app-now__controls \.music-app-now__like--controls,\n\.music-app-now__lyric-preview \{ display: none; \}/, 'Desktop already shows the full lyrics');
});

test('favourites store artwork; the Provider is asked only for the playing song or a failed cover', () => {
  assert.match(music, /const minimalFavorites = [^\n]*art: storableArt\(artworkFor\(track\)\)/, 'Stored and synced favourites keep the artwork URL');
  const storable = music.match(/const storableArt = (\(value\) => [^;]+);/)?.[1];
  assert.ok(storable, 'storableArt must exist');
  const storableArt = new Function(`return ${storable}`)();
  assert.equal(storableArt('https://img.example/a.jpg'), 'https://img.example/a.jpg', 'Provider URLs are stored');
  for (const value of ['data:image/png;base64,AAAA', 'blob:https://zhiyin.us.ci/1', '', undefined]) assert.equal(storableArt(value), '', String(value));
  assert.match(music, /const artworkFor = \(track\) => \{[\s\S]*?songCache\(\)\[track\.songId\]\?\.art[\s\S]*?track\.binding\?\.art/);
  assert.doesNotMatch(music, /prefetch/i, 'Lists never fetch artwork in bulk');
  assert.match(music, /<Artwork src=\{rowArt\(track\)\} loading="lazy" onError=\{\(\) => requestRowArtwork\(track\)\} onUnavailable=\{\(\) => requestRowArtwork\(track\)\} \/>/, 'A list cover that fails, or has no usable URL, may ask the Provider');
  assert.match(music, /new IntersectionObserver\([\s\S]*?observer\.disconnect\(\); onUnavailableRef\.current\?\.\(\);[\s\S]*?rootMargin: '200px 0px'/, 'Missing covers are requested only once they scroll near the viewport');
  assert.match(music, /function requestRowArtwork\(track\) \{[\s\S]*?state\.tried\.has\(track\.songId\)\) return;[\s\S]*?state\.tried\.add\(track\.songId\)/, 'Each song is requested at most once per session');
  assert.match(music, /while \(state\.active < 2 && state\.queue\.length\)/, 'At most two list cover requests run at once');
  assert.match(music, /for \(const \{ track \} of state\.queue\) state\.tried\.delete\(track\.songId\);\s*state\.queue = \[\];\s*\}, \[listView, routePath\]\);/, 'Leaving a list drops its queued requests');
  const usable = new Function(`const EMPTY_ART = 'data:image/svg+xml,empty'; return ${music.match(/const usableArt = (\(value\) => \{[^\n]*\});/)[1]}`)();
  assert.equal(usable('120/s3s94/93/1.jpg'), '', 'Bare paths are never requested from this site');
  assert.equal(usable('https://img1.kuwo.cn/a.jpg'), 'https://img1.kuwo.cn/a.jpg');
  assert.deepEqual(music.match(/<img (?:\{\.\.\.props\}|src="[^"]*")/g), ['<img {...props}', '<img src="/zhiyin-logo.png"'], 'Every cover renders through Artwork; only the logo is a plain image');
  assert.match(music, /function Artwork\([\s\S]*?const url = usableArt\(src\) && src !== failed \? src : EMPTY_ART;[\s\S]*?setFailed\(url\); onError\?\.\(event\);/, 'Missing or broken covers fall back to the default artwork');
  assert.match(music, /const unavailable = !usableArt\(src\);[\s\S]*?const watching = Boolean\(onUnavailable\) && unavailable;/, 'Missing and unusable URLs are reported without being requested from this site');
  assert.match(music, /function applyArtwork\(song, url, binding\) \{[\s\S]*?setLikedTracks\(next\);[\s\S]*?markFavoritesDirty\(\);/, 'Fetched artwork is written back to favourites');
  assert.equal((music.match(/musicRequest\('artwork'/g) || []).length, 3, 'Artwork is requested only for the playing song (missing or failed) and for a list cover that failed');
});

test('search loads the next page when the end of the results scrolls into view', () => {
  assert.doesNotMatch(music, /onScroll=\{handleListScroll\}/, 'The list itself does not scroll, so a scroll handler on it never fires');
  assert.match(music, /\{listView === 'search' && hasMoreResults && <div ref=\{listEndRef\} className="music-app-list-end" aria-hidden="true" \/>\}/);
  assert.match(music, /new IntersectionObserver\(\(entries\) => \{ if \(entries\.some\(\(entry\) => entry\.isIntersecting\)\) loadNextPageRef\.current\(\); \}, \{ root: scrollParentOf\(end\), rootMargin: '0px 0px 400px 0px' \}\)/);
  assert.match(music, /\}, \[listView, hasMoreResults, results\.length, loadingMore\]\);/, 'Re-observing after each page fills screens taller than one page');
  assert.match(music, /const row = currentRowRef\.current; const list = scrollParentOf\(musicListRef\.current\);/, 'The playing row is located inside the element that actually scrolls');
});

test('library sub-pages offer a way back to 音乐库 on phones', () => {
  assert.match(music, /\['likes', 'history', 'local'\]\.includes\(listView\) && <div className="music-app-toolbar music-app-library-back">[\s\S]*?navigate\('\/playlists'\)[\s\S]*?返回音乐库/);
  assert.match(layout, /\.music-app-library-back \{ display: none; \}[\s\S]*?@media \(max-width: 700px\) \{\s*\.music-app-library-back \{\s*display: flex;/);
});

test('full-screen player colours follow the site theme in both styles', () => {
  for (const selector of ['.music-app-now.is-classic', 'html[data-theme="glass"] .music-app-now', 'html[data-theme="light"] .music-app-now', 'html[data-theme="light"] .music-app-now.is-classic']) {
    assert.ok(player.includes(`${selector} {\n  --now-`), selector);
  }
  const body = player.slice(player.indexOf('.music-app-now.is-open {'));
  assert.doesNotMatch(body.replace(/@media[^{]+\{\s*\.music-app-now \{[^}]*\}/g, ''), /(?:^|\n)\s*(?:color|background(?:-color)?): #/, 'Colours come from --now-* properties');
});

test('mobile mini-player keeps accessible hit areas while drawing lighter controls', () => {
  assert.match(player, /\.music-app-player \{[^}]*height: 64px;/);
  assert.match(player, /\.music-app-player \.music-controls \.play-button::before \{[^}]*inset: 5px;/);
  assert.match(player, /\.music-app-player \.music-controls \.music-icon-button \{[^}]*width: 44px;[^}]*height: 44px;[^}]*background: transparent;/);
});

test('random play gives each song a fixed time to start and refreshes it only once', () => {
  assert.match(music, /const RANDOM_TRACK_BUDGET_MS = 25000;/);
  assert.match(music, /setCurrentId\(selected\.songId\); beginRandomBudget\(selected\.songId\);/, 'The budget starts when a random pick is selected');
  assert.match(music, /beginRandomBudget\(track\.songId\); selectTrack\(track\.songId, inQueue \? null : randomBatchRef\.current\.tracks, 'random'\);/, 'Every song from the batch gets its own budget');
  assert.match(music, /onPlaying=\{\(\) => \{ clearMediaDeadline\(\); clearRandomBudget\(\);/, 'Playing ends the budget');
  assert.match(music, /randomBudgetExpiredRef\.current = \(songId\) => \{[\s\S]*?resolveRequestRef\.current\?\.abort\(\);[\s\S]*?playNextRandom\('这首歌加载超时，已自动播放下一首'\);/, 'An expired budget abandons the song and plays a backup');
  assert.match(music, /if \(playMode\.current === 'random' && previous\) return false;/, 'Random play refreshes a failing song once');
  assert.match(music, /if \(retryWithRefresh\(refreshMode\)\) \{ setToast\(\{ title: '正在重新获取音源'/, 'A retry says so instead of claiming the next song plays');
  assert.match(music, /function playNextRandom\(message = '', recover = false\) \{\s*if \(message\) \{\s*showToast\(message, 'warning'\); randomFailuresRef\.current \+= 1;/, 'Skipping in random play is announced and counted');
  assert.match(music, /if \(randomFailuresRef\.current >= RANDOM_FAILURE_LIMIT\) \{ stopRandom\(\);/, 'A run of failures stops random play instead of requesting batches forever');
});

test('random play works through one batch before asking the Provider again', () => {
  const next = music.slice(music.indexOf('  const next = (automatic = false) => {'), music.indexOf('  const previous = () => {'));
  assert.match(next, /if \(playMode\.current === 'random'\) \{ playNextRandom\('', !automatic\); return; \}\s*if \(playbackMode === 'shuffle'\)/, 'Next and auto-advance pick from the batch in every playback mode');
  assert.doesNotMatch(next, /startRandom\(/, 'Skipping a song never requests a batch directly');
  const previous = music.slice(music.indexOf('  const previous = () => {'), music.indexOf('  const toggle = () => {'));
  assert.ok(previous.indexOf("playMode.current === 'random'") < previous.indexOf("playbackMode === 'shuffle'"), 'Previous walks random history before shuffle');
  assert.match(music, /function unplayedRandomTracks\(\) \{ return randomBatchRef\.current\.tracks\.filter\(\(track\) => !randomTrackKeys\.current\.includes\(randomTrackKey\(track\)\)\); \}/);
  const pick = music.slice(music.indexOf('  function playNextRandom('), music.indexOf('  const loadChart'));
  assert.ok(pick.indexOf('unplayedRandomTracks()') < pick.indexOf('randomBatchRef.current.next') && pick.indexOf('randomBatchRef.current.next') < pick.indexOf('startRandom({ recover })'), 'Unplayed songs first, then the batch requested ahead, then a new request');
  assert.match(music, /if \(playMode\.current === 'random'\) \{ randomFailuresRef\.current = 0; requestNextRandomBatch\(\); \}/, 'Each song that starts may request the next batch ahead');
  assert.match(music, /if \(!batch\.tracks\.length \|\| batch\.next \|\| batch.request \|\| unplayedRandomTracks\(\)\.length\) return;/, 'The next batch is requested only once, while the last song plays');
  assert.match(music, /onClick=\{startRandom\} disabled=\{randomLoading\}/, 'The home button always requests a fresh batch');
  assert.doesNotMatch(music, /randomFallbackTracks/);
  assert.doesNotMatch(music, /已尝试刷新音源|已强制刷新音源|重新解析后仍无法播放/, 'Skip messages describe what actually happened');
});

test('switching songs shows its state, slides the new song in and answers every press', () => {
  assert.match(music, /const playbackStatus = playbackState === 'resolving' \? \(recoveringId === currentId \? '音源失效，正在重新获取…' : '正在获取音源…'\)/);
  assert.match(music, /playbackState === 'loading' \? '正在缓冲…'/);
  assert.match(music, /playbackState === 'error' \? '无法播放，点击播放按钮重试'/);
  assert.match(music, /const shownTitle = randomLoading \? '正在挑选下一首…' : current\?\.title;/, 'Waiting for a random batch does not keep the previous title');
  assert.match(music, /<span className="music-visually-hidden" role="status">\{playbackAnnouncement\}<\/span>/, 'Screen readers hear the state');
  assert.match(music, /className=\{`music-player__progress\$\{isPlaybackBusy \? ' is-pending' : ''\}`\}/);
  for (const key of ['art', 'copy', 'cover', 'meta']) assert.match(music, new RegExp(`key=\\{\`${key}:\\$\\{currentId\\}\`\\} data-switch=\\{switchDirection\\}`), key);
  assert.equal((music.match(/data-control="(?:previous|play|next)" onClick=\{\(event\) => \{ pressFeedback\(event\.currentTarget\);/g) || []).length, 6, 'Both players animate previous, play and next on every press');
  assert.match(music, /const pulseControl = useCallback\(\(name\) => \{ document\.querySelectorAll\(`\[data-control="\$\{name\}"\]`\)\.forEach\(pressFeedback\); \}, \[\]\);/, 'Media keys reach the same buttons');
  assert.match(player, /:is\(\.music-app-player, \.music-app-now\) \[data-switch="previous"\] \{ animation-name: music-switch-previous; \}/);
  assert.match(player, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\[data-switch\] \{ animation: none; \}/);
});

test('previous switches straight back and says so when there is nothing before', () => {
  const previous = music.slice(music.indexOf('  const previous = () => {'), music.indexOf('  const toggle = () => {'));
  assert.doesNotMatch(previous, /currentTime = 0/, 'Previous never restarts the current song instead of switching');
  assert.equal((previous.match(/noPreviousTrack\(\); return;/g) || []).length, 3, 'Random history, shuffle and an empty queue each explain why nothing changed');
});

test('lock screen and system media controls get the song duration and position', () => {
  assert.match(music, /navigator\.mediaSession\.setPositionState\(\{ duration: length, playbackRate: media\.playbackRate \|\| 1, position: Math\.min\(Math\.max\(0, media\.currentTime \|\| 0\), length\) \}\);/);
  assert.match(music, /!Number\.isFinite\(length\) \|\| length <= 0\) \{ navigator\.mediaSession\.setPositionState\(\); return; \}/, 'An unknown duration clears the position instead of showing a wrong bar');
  assert.match(music, /<audio ref=\{audio\} onDurationChange=\{syncPositionState\} onSeeked=\{syncPositionState\} onRateChange=\{syncPositionState\}/, 'Updated when a song loads, after a seek and when the rate changes');
  assert.match(music, /navigator\.mediaSession\.playbackState = playing \? 'playing' : 'paused';\s*\}\s*syncPositionState\(\);/, 'Pausing and resuming pin the position');
});

test('play history counts each song start once and syncs lazily', () => {
  const hook = readFileSync(new URL('../src/luri-music/useMusicLibrary.js', import.meta.url), 'utf8');
  assert.match(music, /if \(current && historyStartIdRef\.current === currentId\) \{ historyStartIdRef\.current = ''; recordHistory\(current\); \}/, 'Resume, seek and buffering fire playing again but do not count');
  assert.equal((music.match(/historyStartIdRef\.current = (?:id|currentId|selected\.songId);/g) || []).length, 3, 'A new song, a repeat-one restart and a random pick start a play');
  assert.match(music, /const recordHistory = [\s\S]*?\}, \{ deferSync: true \}\);\r?\n  \};/, 'History changes wait for the deferred sync');
  assert.match(hook, /urgentRef\.current \? EDIT_SYNC_DELAY_MS : DEFERRED_SYNC_DELAY_MS/);
  assert.match(hook, /document\.addEventListener\('visibilitychange', flush\); window\.addEventListener\('pagehide', flush\);/, 'Deferred changes are flushed when the page is hidden or closed');
  assert.match(hook, /keepalive: leaving && body\.length < KEEPALIVE_LIMIT/);
});

test('settings offer random play preferences that default to new Chinese songs and reach the Provider', () => {
  assert.match(music, /const DEFAULT_RANDOM_PREFERENCES = \{ era: 'new', languages: \['zh'\] \};/);
  assert.match(music, /const RANDOM_LANGUAGE_OPTIONS = \[\['zh', '华语'\], \['en', '欧美'\], \['jk', '日韩'\], \['yue', '粤语'\], \['instrumental', '纯音乐'\]\];/);
  const read = new Function(`const RANDOM_ERA_OPTIONS = [['new'], ['any'], ['classic']]; const RANDOM_LANGUAGE_OPTIONS = [['zh'], ['en'], ['jk'], ['yue'], ['instrumental']]; const DEFAULT_RANDOM_PREFERENCES = { era: 'new', languages: ['zh'] }; return ${music.match(/const readRandomPreferences = (\(value\) => \(\{[\s\S]*?\}\));/)[1]}`)();
  assert.deepEqual(read(undefined), { era: 'new', languages: ['zh'] }, 'Defaults when nothing is saved');
  assert.deepEqual(read({ era: 'classic', languages: [] }), { era: 'classic', languages: [] }, 'An empty list means no language preference');
  assert.deepEqual(read({ era: 'x', languages: ['en', 'en', 'xx'] }), { era: 'new', languages: ['en'] });
  assert.match(music, /function randomRequestParams\(\) \{ return \{ exclude: randomSingers\.current\.join\(','\), era: randomPreferences\.era, languages: randomPreferences\.languages\.join\(','\) \}; \}/);
  assert.equal((music.match(/musicRequest\('random', randomRequestParams\(\), controller\.signal\)/g) || []).length, 2, 'The home button and the batch requested ahead both send the preferences');
  assert.match(music, /updateLibrary\(\(value\) => \(\{ \.\.\.value, settings: \{ \.\.\.\(value\.settings \|\| \{\}\), randomPreferences: next \} \}\)\);\s*randomBatchRef\.current\.next = null;/, 'Saved in the synced library; a batch requested with old preferences is dropped');
  const settings = music.slice(music.indexOf("{listView === 'settings' &&"), music.indexOf("{!['playlists', 'settings', 'random'].includes(listView)"));
  assert.match(settings, /\n\s*<section className="music-app-settings__random"/, 'Guests can set it too');
  assert.match(settings, /\[\['', '不限'\], \.\.\.RANDOM_LANGUAGE_OPTIONS\]/);
});
