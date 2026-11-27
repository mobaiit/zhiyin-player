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
  assert.deepEqual([...breakpoints].sort(), ['1040', '1180', '359', '390', '700', '701'], 'Players share the app breakpoints');
});

test('bottom player shows time after the artist on desktop and as its own column on phones', () => {
  const footer = music.slice(music.indexOf('<footer className="music-player music-app-player">'));
  const info = footer.slice(footer.indexOf('<div className="music-player__info">'), footer.indexOf('<div className="music-controls">'));
  assert.match(info, /<span className="music-player__artist">\{shownSubtitle \|\| '知音'\}<\/span>\{current && <span className="music-player__subtitle-time">· \{time\(progress\)\} \/ \{Number\.isFinite\(duration\) && duration > 0 \? time\(duration\) : '--:--'\}<\/span>\}<\/small>/);
  assert.match(info, /<\/button>\{current && <span className="music-player__time"/);
  assert.match(info, /Number\.isFinite\(duration\) && duration > 0 \? time\(duration\) : '--:--'\}<\/span><\/span>\}<\/div>/);
  assert.match(player, /\.music-app-player \.music-player__info \{[^}]*grid-column: 1;[^}]*display: flex;/);
  assert.match(player, /\.music-app-player \.music-player__copy \.music-player__subtitle-time \{[^}]*flex: 0 0 auto;/, 'A long artist name truncates before the time');
  assert.match(player, /\.music-app-player \.music-player__time \{\s*display: none;/, 'Desktop has no separate time column');
  assert.match(player, /@media \(max-width: 700px\)[\s\S]*?\.music-app-player \.music-player__copy \.music-player__subtitle-time \{ display: none; \}[\s\S]*?\.music-app-player \.music-player__time \{\s*display: flex;/);
  assert.match(player, /@media \(max-width: 700px\)[\s\S]*?\.music-app-player \.music-player__time \{[^}]*flex-direction: column;/);
  assert.match(player, /@media \(max-width: 359px\) \{\s*\.music-app-player \.music-player__time \{ display: none; \}/);
});

test('the random card names the song playing in random mode and pans a long name', () => {
  assert.match(music, /const setPlayMode = \(mode\) => \{ playMode\.current = mode; setRandomMode\(mode === 'random'\); \};/);
  assert.doesNotMatch(music.replace('playMode.current = mode;', ''), /playMode\.current = /, 'Every mode change goes through setPlayMode');
  assert.match(music, /\{randomMode && current \? <p className="music-app-home-now"><span>正在播放：<\/span><PlayerTitle className="music-app-home-now__title">\{\[current\.title, current\.artist\]\.filter\(Boolean\)\.join\(' - '\)\}<\/PlayerTitle><\/p>/);
  assert.match(layout, /\.music-app-home-now__title\[data-overflow="true"\] \.music-app-home-now__title-text \{ animation: music-home-now-pan/);
  assert.match(layout, /@media \(max-width: 700px\) \{[\s\S]*?\.music-app-home-copy > \.music-app-home-now \{ display: flex;/, 'Phones hide the description but keep the song line');
});

test('song rows show a known duration after the artist and nothing when it is unknown', () => {
  assert.match(music, /<small>\{track\.artist\}\{track\.album \? ` · \$\{track\.album\}` : ''\}<\/small>\{Number\(track\.duration\) > 0 && <small className="music-app-track__duration">· \{time\(Number\(track\.duration\)\)\}<\/small>\}/);
  assert.match(layout, /\.music-app-track__meta small\.music-app-track__duration \{[^}]*flex: 0 0 auto;/, 'A long album truncates before the duration');
});

test('song rows always offer favourite, add to playlist, play and download', () => {
  const list = readFileSync(new URL('../src/pages/Music.css', import.meta.url), 'utf8');
  const actions = music.slice(music.indexOf('<div className="music-app-track__actions">'), music.indexOf('</div>', music.indexOf('<div className="music-app-track__actions">')));
  const order = ['music-app-track__like', 'openAddToPlaylist(track)', 'music-app-track__play', 'music-app-track__download'].map((marker) => actions.indexOf(marker));
  assert.ok(order.every((position, index) => position > 0 && (index === 0 || position > order[index - 1])), 'Favourite, add to playlist, play, download');
  assert.match(actions, /onClick=\{\(\) => like\(track\)\}/, 'A row favourites its own song');
  assert.match(music, /const like = \(song\) => \{\s*if \(!song\) return;/, 'like() no longer falls back to the current song');
  assert.match(actions, /\{busy \? <span className="music-spinner" \/> : <MusicIcon name=\{state === 'playing' \? 'pause' : 'play'\} \/>\}/, 'The play button shows loading and pause');
  assert.match(music, /<span className="music-app-track__index">\{selecting \? [\s\S]*? : String\(isChartView \? track\.rank \|\| index \+ 1 : index \+ 1\)\.padStart\(2, '0'\)\}<\/span>/, 'The index stays a number');
  assert.match(music, /const downloadTrack = async \(track\) => \{[\s\S]*?const tab = window\.open\('', '_blank'\);[\s\S]*?musicRequest\('resolve'/, 'Download opens its tab during the click, then resolves the URL');
  assert.doesNotMatch(list, /\.music-app-track__actions > button \{ opacity: 0;/, 'Actions stay visible');
  assert.match(actions, /openAddToPlaylist\(track\)\} aria-label=\{`将 \$\{track\.title\} 加入歌单`\} title="加入歌单"><MusicIcon name="add" \/>/, 'Adding uses the plus icon');
  assert.match(actions, /title="从歌单移除"><MusicIcon name="remove" \/><\/button>/, 'Removing from a playlist is an icon');
  assert.match(list, /@media \(max-width: 700px\) \{\s*\.music-app-track__actions :is\(\.music-app-track__play, \.music-app-track__download\) \{ display: none; \}/, 'Phones keep favourite and add to playlist');
  assert.doesNotMatch(music, /music-app-track--head/, 'Rows are two lines again, with no column header');
});

test('chosen search results, up to 30, go into playlists without duplicates or removals', () => {
  assert.match(music, /const SEARCH_SELECTION_LIMIT = 30;/);
  assert.match(music, /const selectionLimit = choosesWholeList \? WHOLE_LIST_SELECTION_LIMIT : SEARCH_SELECTION_LIMIT;/);
  assert.match(music, /if \(selectedSongIds\.length >= selectionLimit\) \{ showToast\(`一次最多选择 \$\{selectionLimit\} 首`, 'warning'\); return; \}/);
  assert.match(music, /onClick=\{\(\) => setSelectedSongIds\(allSongsChosen \? \[\] : selectionTracks\.slice\(0, selectionLimit\)\.map\(\(track\) => track\.songId\)\)\}/, 'One icon chooses all or none');
  assert.match(music, /onClick=\{\(\) => selecting \? toggleSongSelection\(track\) : handleTrackAction\(track\)\}/, 'In selection mode a row click selects');
  assert.match(music, /const snapshots = canonicalTracks\(selectedSongs\)\.slice\(0, selectionLimit\);/);
  assert.match(music, /if \(!append\) \{ setSelectedSongIds\(\[\]\);/, 'A new search starts with nothing chosen');
  assert.match(music, /const missing = snapshots\.filter\(\(track\) => !playlist\.tracks\.some\(\(item\) => samePlaylistTrack\(item, track\)\)\);\s*const room = Math\.max\(0, 200 - playlist\.tracks\.length\);/, 'Songs already there are skipped and a playlist stops at 200');
  assert.match(music, /if \(!selected\.has\(playlist\.id\)\) return playlist;/, 'Unselected playlists keep every song');
  assert.match(music, /dialogBatch\.length \? <button className="music-app-primary music-app-modal__save" type="button" disabled=\{!playlistSelection\.length\} onClick=\{saveBatchToPlaylists\}>/);
});

test('an idle player shows the last song played, else the first discovered one, without playing it', () => {
  assert.match(music, /const idleTrack = current \? null : library\.history\[0\] \|\| randomTracks\[0\] \|\| null;/);
  assert.match(music, /if \(!current && idleTrack\) return selectTrack\(idleTrack\.songId, library\.history\[0\] \? library\.history : randomTracks\);/, 'Play starts the song shown');
  const footer = music.slice(music.indexOf('<footer className="music-player music-app-player">'), music.indexOf('</footer>', music.indexOf('<footer className="music-player music-app-player">')));
  assert.match(footer, /src=\{usableArt\(shownTrack\?\.art\)\}/);
  assert.match(footer, /<div className="music-controls"><span className="music-controls__side music-controls__side--start"><button className=\{`music-icon-button music-player__like[\s\S]*?onClick=\{\(\) => like\(shownTrack\)\}[\s\S]*?music-player__add" type="button"[\s\S]*?onClick=\{\(\) => openAddToPlaylist\(shownTrack\)\}[\s\S]*?<MusicIcon name="add" \/><\/button><button className="music-icon-button music-player__previous"/, 'Favourite and add sit left of previous');
  assert.match(footer, /title="歌词"><MusicIcon name="lyrics" \/><\/button>/);
  assert.match(player, /\.music-app-player \.music-controls :is\(\.music-player__like, \.music-player__add, \.music-player__previous\),/, 'Phones hide them with previous');
});

test('desktop list pages float in a card over a gradient canvas, with labelled navigation', () => {
  const desktop = layout.slice(layout.indexOf('/* Desktop surfaces.'));
  assert.match(desktop, /html\[data-theme="light"\] \{\s*--zy-app-backdrop:/);
  assert.match(desktop, /html\[data-theme="dark"\] \{\s*--zy-app-backdrop:/);
  assert.match(desktop, /\.luri-music-clone\.is-standalone:has\(\.music-app-shell\) \{ background: var\(--zy-app-backdrop\) !important; \}/, 'Overrides the flat canvas painted with !important');
  assert.match(desktop, /:is\(\.music-app-sidebar, \.music-app-topbar\) \{\s*border-color: transparent !important;\s*background: transparent !important;/);
  assert.match(desktop, /\.music-app-shell:not\(\.view-random\):not\(\.view-playlists\):not\(\.view-settings\) \.music-app-page \{[^}]*border-radius: 22px;[^}]*box-shadow: var\(--zy-theme-shadow\);/);
  assert.match(desktop, /\.music-app-sidebar nav button\.active \{[^}]*background: var\(--app-accent\) !important;/, 'The selected item is a solid red pill');
  assert.match(music, /const NAV_SECTIONS = \{ 0: '在线发现', 3: '我的音乐' \};/);
  assert.match(music, /\{NAV_SECTIONS\[index\] && <span className="music-app-sidebar__label">\{NAV_SECTIONS\[index\]\}<\/span>\}/);
});

test('desktop text follows one scale: navigation and toolbars no larger than the songs', () => {
  const scale = layout.slice(layout.indexOf('/* Desktop type scale'));
  assert.match(scale, /\.music-app-sidebar nav button \{ font-size: 14px; font-weight: 500; \}/);
  assert.match(scale, /\.music-app-toolbar :is\(\.music-app-segment button, \.music-app-quiet, \.music-app-primary\) \{ font-size: 13px; \}/);
  assert.match(scale, /\.music-app-track__copy b \{ font-size: 14px; font-weight: 600; \}/);
  assert.match(scale, /\.music-app-track__meta small \{ font-size: 12px; \}/);
});

test('the default cover is the Zhiyin icon and playlists show their first song', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(music, /const EMPTY_ART = 'data:image\/svg\+xml,%3Csvg[^']*%23dc1a2b[^']*%23f7f6f7[^']*';/, 'Red icon with a white note');
  assert.match(html, /<link rel="icon" type="image\/png" href="\/zhiyin-logo\.png" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/zhiyin-touch-icon\.png" \/>/, 'iOS gets a square icon without transparent corners');
  assert.match(music, /const playlistCover = \(first\) => <span className="music-app-playlist-cover"><Artwork src=\{first \? rowArt\(first\) : ''\}/, 'An empty playlist shows the default cover');
  assert.match(music, /onClick=\{\(\) => navigate\('\/favorites'\)\}>\{playlistCover\(likedTracks\[0\]\)\}<b>我的喜欢<\/b>/);
  assert.match(music, /\{playlistCover\(playlist\.tracks\[0\]\)\}<b>\{playlist\.name\}<\/b>/);
});

test('phone text follows one scale too', () => {
  const scale = layout.slice(layout.indexOf('/* Phone type scale'));
  assert.match(scale, /@media \(max-width: 700px\) \{/);
  assert.match(scale, /:is\(\.music-app-toolbar :is\(\.music-app-segment button, \.music-app-quiet\), \.music-app-primary\) \{ font-size: 14px; \}/, 'Controls no larger than the songs');
  assert.match(scale, /\.music-app-track__copy b \{ font-size: 14px; font-weight: 600; \}/);
  assert.match(scale, /\.music-app-track__meta small \{ font-size: 12px; \}/);
  assert.match(player, /\/\* Phone text matches the app's type scale[\s\S]*?\.music-app-player \.music-player__title \{ font-size: 14px; font-weight: 600; \}[\s\S]*?\.music-app-now \.music-app-now__meta h2 span \{ font-size: 22px; font-weight: 600; \}/);
});

test('each list page keeps its own scroll position', () => {
  assert.match(music, /const pageScrollKey = listView === 'playlist' \? `playlist:\$\{selectedPlaylistId\}` : listView === 'featured' \? `featured:\$\{featuredKey\}` : isChartView \? `\$\{listView\}:\$\{chartType\}` : listView;/);
  assert.match(music, /useLayoutEffect\(\(\) => \{\s*const page = pageRef\.current; if \(!page\) return;\s*const saved = scrollPositionsRef\.current\[pageScrollKey\];\s*page\.scrollTop = saved \|\| 0;/, 'A page comes back where it was left, or starts at the top');
  assert.match(music, /<div className="music-app-page" ref=\{pageRef\} onScroll=\{\(event\) => \{ scrollPositionsRef\.current\[pageScrollKey\] = event\.currentTarget\.scrollTop; \}\}>/);
  assert.match(music, /if \(restoredScrollRef\.current === pageScrollKey\) \{ restoredScrollRef\.current = ''; locatedTrackRef\.current = locationKey; return; \}/, 'A restored page is not pulled to the playing song');
  assert.match(music, /delete scrollPositionsRef\.current\.search;/, 'A new search starts at the top');
});

test('the idle song tells how to get lyrics instead of asking for a search', () => {
  assert.match(music, /const lyricsHint = lyricsState \|\| \(idleTrack \? '点击播放后加载歌词' : ''\);/);
  assert.match(music, /<p className="lyrics-empty">\{lyricsHint \|\| TEXT\.choose\}<\/p>/, 'Desktop lyrics panel');
  assert.match(music, /<span className="is-placeholder">\{lyricsHint \|\| '暂无歌词'\}<\/span>/, 'Phone lyric preview');
});

test('the browser tab names the song while it plays', () => {
  assert.match(music, /document\.title = playing && current \? `▶ \$\{current\.title\} - \$\{current\.artist\}` : '知音';/);
  assert.match(music, /return \(\) => \{ document\.title = '知音'; \};\s*\}, \[playing, current\?\.title, current\?\.artist\]\);/, 'Pausing, switching or leaving puts the title back');
});

test('library sync is silent and retries on its own', () => {
  const hook = readFileSync(new URL('../src/luri-music/useMusicLibrary.js', import.meta.url), 'utf8');
  assert.doesNotMatch(hook, /notify/, 'No sync notices');
  assert.match(hook, /\} catch \{ setSyncState\('pending'\); window\.setTimeout\(\(\) => setSyncRetry\(\(value\) => value \+ 1\), FAILED_SYNC_RETRY_MS\); \}/, 'A failed sync tries again by itself');
  assert.doesNotMatch(music, /music-app-sync|SYNC_STATE_LABELS/, 'No sync status on any page');
});

test('discover shows the Provider\'s featured playlists and opens one as a list page', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes(String.raw`/^\/featured\/(?:netease|qq)\/\d+$/.test(pathname)`), 'A featured playlist URL survives a reload');
  assert.match(music, /path\?\.startsWith\('\/featured\/'\) \? 'featured' : 'random'/);
  assert.match(music, /const unsupported = error\?\.status === 501 \|\| error\?\.code === 'not_supported';/, 'A Provider without playlists hides the section');
  assert.match(music, /\{providerClient && !featuredUnsupported && <section className="music-app-featured"/);
  assert.match(music, /onClick=\{\(\) => navigate\(`\/featured\/\$\{featuredPlatform\}\/\$\{playlist\.id\}`\)\}/);
  assert.match(music, /musicRequest\('playlists', \{ platform, id \}, controller\.signal\)/);
  assert.match(music, /listView === 'featured' \? featuredTracks : listView === 'history'/, 'Its songs are the list and the queue');
  assert.equal((music.match(/\(path === '\/' && \(routePath === '\/discover' \|\| routePath\?\.startsWith\('\/featured\/'\)\)\)/g) || []).length, 2, 'Discover stays highlighted in both navigations');
});

test('settings use two columns on wide screens and keep the reading order in one column', () => {
  const settings = music.slice(music.indexOf("{listView === 'settings' &&"), music.indexOf("{!['playlists', 'settings', 'random'].includes(listView)"));
  const order = ['music-app-settings__account', 'music-app-settings__service', 'music-app-settings__playback', 'music-app-settings__about', 'music-app-settings__random', 'music-app-settings__themes'].map((name) => settings.indexOf(name));
  assert.ok(order.every((position, index) => position > 0 && (index === 0 || position > order[index - 1])), 'Left column: account, service, playback, about; right: random, themes');
  assert.equal((settings.match(/<div className="music-app-settings__column">/g) || []).length, 2);
  assert.match(layout, /@media \(min-width: 1101px\) \{\s*html\[data-theme\] \.music-app-shell \.music-app-settings \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(layout, /\.music-app-settings__column \{ display: contents; \}[\s\S]*?\.music-app-settings__about \{ order: 6; \}/, 'One column reads account, service, playback, random, theme, about');
  assert.match(layout, /\.music-app-settings__rows > button:not\(\.danger\)::after \{[^}]*content: "›";/, 'Rows that open something show an arrow');
  const luri = readFileSync(new URL('../src/luri-music/LuriMusic.jsx', import.meta.url), 'utf8');
  assert.match(luri, /<Modal className="lm-password-modal" title="修改密码"/);
  assert.match(layout, /@media \(max-width: 700px\) \{\s*html\[data-theme\] \.lm-modal:is\(\.lm-password-modal, \.lm-quality-modal, \.lm-provider-modal\) \{ align-items: end; padding: 0; \}/, 'Settings dialogs open from the bottom on phones');
});

test('list pages keep their toolbar at the top, and the phone platform switch stays compact', () => {
  const sticky = layout.slice(layout.indexOf('/* List pages keep their toolbar'));
  assert.match(sticky, /\.music-app-shell:not\(\.view-random\):not\(\.view-playlists\):not\(\.view-settings\) \.music-app-page > \.music-app-toolbar \{ position: sticky; top: 0; z-index: 4; \}/);
  assert.match(sticky, /@media \(min-width: 701px\) \{[\s\S]*?margin: -22px -26px 12px;[\s\S]*?background: var\(--zy-theme-surface\);/, 'Desktop bar spans the card');
  assert.match(sticky, /@media \(max-width: 700px\) \{[\s\S]*?background: var\(--mobile-app-bg\);/, 'Phone bar covers the songs under it');
  assert.match(sticky, /\.music-app-featured-title \.music-app-segment button \{ min-height: 30px; padding: 0 10px; border-radius: 8px; font-size: 13px; \}/);
});

test('list playback: shuffle starts at the chosen song, failures stop after a run, the next address loads early', () => {
  assert.match(music, /if \(playbackMode === 'shuffle'\) resetShufflePlayback\(queue, track\.songId\);\s*setSwitchDirection\('next'\); selectTrack\(track\.songId, queue\);/, 'A chosen song opens a fresh shuffle order');
  assert.match(music, /const first = playbackMode === 'shuffle' \? list\[Math\.floor\(Math\.random\(\) \* list\.length\)\] : list\[0\];/, 'Play all in shuffle starts anywhere');
  assert.match(music, /onClick=\{\(\) => playAll\(selectedPlaylist\.tracks, `playlist:\$\{selectedPlaylist\.id\}`\)\}>播放全部<\/button>/, 'Playlist play all marks its list');
  assert.match(music, /const LIST_FAILURE_LIMIT = 8;/);
  assert.match(music, /if \(failed >= LIST_FAILURE_LIMIT\) \{[^}]*setPlaybackState\('error'\);/, 'A run of failures stops the list');
  assert.match(music, /if \(playbackMode === 'shuffle'\) \{\s*const state = syncShufflePlayback\(queue\);[\s\S]*?state\.index \+= 1;/, 'Skipping a failed song follows the shuffle order');
  assert.match(music, /\} else if \(unreachable\(error\)\) \{[\s\S]*?unreachableRetriesRef\.current\.add\(resolvingTrack\.songId\); setPlaybackAttempt/, 'An unreachable Provider gets one more try');
  assert.match(music, /onPlaying=\{\(\) => \{[^}]*resolveUpcomingTrack\(\);/, 'The next address is asked for while a song plays');
  assert.match(music, /const TrackRow = memo\(function TrackRow\(/, 'Rows are memoized');
  assert.match(music, /const lyricLines = useMemo\(\(\) => \{/, 'Lyrics parse only when they change');
});

test('the top bar cycles the three themes with one button', () => {
  assert.match(music, /import ThemeToggle from '\.\.\/components\/ThemeToggle';/);
  assert.match(music, /<\/form><ThemeToggle className="music-app-theme-toggle" \/>/);
});

test('wide screens centre the app at 1320px on the theme canvas', () => {
  assert.match(layout, /@media \(min-width: 701px\) \{\s*\.luri-music-clone\.is-standalone:has\(\.music-app-shell\) \{ background: var\(--zy-theme-canvas\); \}\s*\.luri-music-clone\.is-standalone > \.music-page\.music-app-shell \{\s*max-width: 1320px;\s*margin-inline: auto !important;/);
  assert.ok(layout.indexOf('max-width: 1320px') > layout.indexOf('.luri-music-clone.is-standalone > .music-page.music-app-shell {\n  width: 100% !important;'), 'Comes after the full-width standalone rule it overrides');
});

test('desktop and mobile players use independent progress rows and non-overlapping lanes', () => {
  assert.match(player, /\.music-app-player \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\);[^}]*grid-template-rows: minmax\(0, 1fr\) 10px;/, 'Equal outer columns centre the transport');
  assert.match(player, /\.music-app-player \.music-controls \{[^}]*grid-template-columns: 1fr auto 1fr;/, 'Equal sides centre play within the transport');
  assert.match(music, /<MusicIcon name="previous" \/><\/button><\/span><button className="music-icon-button play-button"[\s\S]*?<span className="music-controls__side music-controls__side--end"><button className="music-icon-button music-player__next"/);
  assert.match(player, /@media \(max-width: 700px\) \{[\s\S]*?\.music-app-player \.music-controls__side \{ display: contents; \}/, 'Phones keep the flat mini transport');
  assert.match(music, /style=\{\{ '--music-volume': `\$\{\(muted \? 0 : volume\) \* 100\}%` \}\} aria-label="音量"/);
  assert.match(player, /\.music-app-player \.music-volume input \{[^}]*background: linear-gradient\(to right, var\(--zy-red\) 0 var\(--music-volume\), var\(--zy-border\) var\(--music-volume\) 100%\) center \/ 100% 3px no-repeat;/, 'A thin volume track in the theme red');
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
  assert.match(controls, /\{likeButton\('music-app-now__like--controls'\)\}<\/div>/, 'Favourite keeps the rightmost slot');
  assert.match(music, /className="music-app-now__add--actions" type="button" disabled=\{!shownTrack\} aria-label="加入歌单" title="加入歌单" onClick=\{\(\) => openAddToPlaylist\(shownTrack\)\}><MusicIcon name="add" \/><\/button>/, 'Icon only, named by its label and tooltip');
  assert.match(music, /title=\{isLiked \? '取消收藏' : '收藏'\} aria-pressed=\{isLiked\} onClick=\{\(\) => like\(current\)\}><MusicIcon name="heart" \/><\/button>;/, 'The favourite has no text label');
  assert.match(player, /\.music-app-now__actions :is\(button, a\) \{[^}]*width: 48px;[^}]*padding: 0;[^}]*border-radius: 50%;/, 'Round icon buttons on desktop');
  assert.match(player, /\.music-app-now__like--controls span,\s*\.music-app-now__actions \.music-app-now__like--actions \{ display: none; \}/, 'An icon-only favourite; copy link and add share the actions row');
  assert.match(player, /\.music-app-now__actions \{[^}]*grid-area: actions;\s*justify-self: end;[^}]*justify-content: end;/, 'Right-aligned');
  const list = readFileSync(new URL('../src/pages/Music.css', import.meta.url), 'utf8');
  assert.match(list, /\.music-app-modal \{ position: fixed; z-index: 110;/, 'The dialog opens above the full-screen player (z-index 100)');
  assert.match(player, /\.music-app-now \{[^}]*z-index: 100;/);
  assert.match(player, /\.music-app-now__controls \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
});

test('the phone lyric preview always takes two lines, so switching songs never moves the cover', () => {
  const preview = music.slice(music.indexOf('className="music-app-now__lyric-preview"'), music.indexOf('</button>', music.indexOf('className="music-app-now__lyric-preview"')));
  assert.match(preview, /lyricLines\[previewLyric \+ 1\]\?\.text \|\| '\\u00a0'/, 'The last line keeps an empty second line');
  assert.match(preview, /<span className="is-placeholder">\{lyricsHint \|\| '暂无歌词'\}<\/span><span aria-hidden="true">\{'\\u00a0'\}<\/span>/, 'Loading and no-lyrics messages keep two lines');
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
  assert.match(music, /<Artwork src=\{art\} loading="lazy" onError=\{\(\) => requestRowArtwork\(track\)\} onUnavailable=\{\(\) => requestRowArtwork\(track\)\} \/>/, 'A list cover that fails, or has no usable URL, may ask the Provider');
  assert.match(music, /<TrackRow [^>]*art=\{rowArt\(track\)\}/, 'Each row gets its cover from rowArt');
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

test('searching shows progress on phones, where the submit button is hidden', () => {
  assert.doesNotMatch(music, /music-app-search__submit/, 'No text search button');
  assert.match(music, /<button className="music-app-search__icon" type="submit" disabled=\{isSearching\} aria-label="搜索" title="搜索">\{isSearching \? <span className="music-spinner" \/> : <MusicIcon name="search" \/>\}<\/button>/, 'The magnifier submits and shows the spinner');
  assert.match(music, /enterKeyHint="search"/, 'Phone keyboards offer a search key');
  assert.match(music, /listView === 'search' && <div className=\{`music-app-empty\$\{isSearching \? ' is-searching' : ''\}`\} role="status"><strong>\{isSearching \? <><span className="music-spinner" \/> \{TEXT\.searching\}<\/> : resultPage > 0 \? TEXT\.noResult : TEXT\.searchHint\}/, 'The cleared list says it is searching, then no results, instead of 这里还没有歌曲');
});

test('the random card carries the recently discovered songs, and featured playlists page by style', () => {
  assert.match(music, /随机播放<\/button>\{randomTracks\.length > 0 && <button className="music-app-home-more" type="button" onClick=\{\(\) => navigate\('\/discover'\)\}>查看更多<\/button>\}/, 'Recently discovered songs open from one button beside random play');
  assert.doesNotMatch(music, /<h3>最近发现<\/h3>|music-app-home-recent/, 'No row of covers and no separate section');
  assert.doesNotMatch(music, /setPlayMode\('random'\); setListView\('random'\); setMobileView\('now'\)/, 'Random play does not open the full-screen player');
  assert.match(music, /musicRequest\('playlists', \{ platform, category, \.\.\.\(cursor \? \{ cursor \} : \{\}\) \}\)/, 'Pages are asked for by style and cursor');
  assert.match(music, /\{featuredPage\?\.nextCursor && <div className="music-app-featured-more">/, 'More loads while the Provider has more');
  assert.match(music, /<div className="music-app-featured-styles" role="group" aria-label="歌单风格">\{featuredCategories\.map/, 'Every style laid out flat');
  assert.match(layout, /\.music-app-featured-styles \{ display: flex; flex-wrap: wrap;/);
  assert.match(layout, /\.music-app-featured-cards > button:nth-child\(n \+ 9\) \{ display: grid; \}/, 'Phones show every loaded playlist');
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
  assert.match(music, /const RANDOM_FAILURE_LIMIT = 8;/, 'Random play stops after as many failures as a list');
});

test('search, charts and a featured playlist share back, play all and an icon to add to my playlists', () => {
  assert.match(music, /const WHOLE_LIST_SELECTION_LIMIT = 200;/);
  assert.match(music, /const choosesWholeList = listView === 'featured' \|\| isChartView;/);
  assert.match(music, /setSelectedSongIds\(choosesWholeList \? selectionTracks\.slice\(0, selectionLimit\)\.map\(\(track\) => track\.songId\) : \[\]\)/, 'A featured playlist or chart starts with every song chosen, search with none');
  assert.match(music, /const selecting = \(\['search', 'featured'\]\.includes\(listView\) \|\| isChartView\) && selectingSongs;/);
  assert.match(music, /aria-label="加入我的歌单" title="加入我的歌单"><MusicIcon name="playlist" \/><\/button>/, 'The entry is an icon');
  assert.doesNotMatch(music, /选择歌曲加入歌单|选择前 \{/, 'No text buttons remain');
  assert.match(music, /useEffect\(\(\) => \{ setSelectingSongs\(false\); setSelectedSongIds\(\[\]\); \}, \[selectionScope\]\);/, 'Leaving the list ends the choice');
  // Search: back to where search opened, play all, add.
  assert.match(music, /<div className="music-app-toolbar music-app-search-toolbar"><button className="music-app-quiet music-app-back-button" type="button" onClick=\{leaveSearch\}><MusicIcon name="back" \/><span>返回<\/span><\/button>\{results\.length > 0 && <>\{!selectingSongs && <button className="music-app-primary" type="button" onClick=\{\(\) => playAll\(results, `search:\$\{activeSearchRef\.current\}`\)\}>播放全部<\/button>\}\{songSelectionTools\}<\/>\}<\/div>/);
  assert.match(music, /const leaveSearch = \(\) => \{ const \{ path, view \} = searchOriginRef\.current; if \(path !== routePath\) navigate\(path\); else setListView\(view\); \};/);
  // Charts: no back; actions on the first row, platform, chart type and refresh on the second.
  assert.match(music, /<div className="music-app-toolbar music-app-chart-toolbar"><div className="music-app-chart-toolbar__actions">\{!selectingSongs && <button className="music-app-primary" type="button" disabled=\{!chartData\.tracks\.length\} onClick=\{\(\) => playAll\(chartData\.tracks, `charts:\$\{listView\}:\$\{chartType\}`\)\}>播放全部<\/button>\}\{songSelectionTools\}<\/div><div className="music-app-chart-toolbar__filters">/);
  assert.match(music, /aria-label="刷新榜单" title="刷新榜单"><MusicIcon name="refresh" \/><\/button><\/div><\/div>\}/, 'Refresh is an icon');
  // Featured playlist: back, play all, add.
  assert.match(music, /<span>返回发现<\/span><\/button>\{!selectingSongs && <button className="music-app-primary" type="button" disabled=\{!featuredTracks\.length\} onClick=\{\(\) => playAll\(featuredTracks, `featured:\$\{featuredKey\}`\)\}>播放全部<\/button>\}\{songSelectionTools\}<\/div>\}/);
  assert.match(layout, /\.music-app-toolbar\.music-app-chart-toolbar \{\s*flex-direction: column;/);
  assert.match(layout, /\.music-app-shell \.music-app-toolbar \.music-app-icon-tool \{[^}]*width: 44px;/);
});

test('player buttons do not stay highlighted after a tap', () => {
  assert.match(player, /@media \(hover: hover\) \{\s*\.music-app-player \.music-controls \.music-icon-button:hover \{/, 'Control hover is limited to devices that can hover');
  assert.match(player, /@media \(hover: hover\) \{\s*\.music-app-player \.music-controls \.play-button:hover \{/);
  assert.doesNotMatch(player, /\.music-icon-button:hover \{\s*border-color: rgba\(229, 72, 77, 0\.55\)/, 'Hover no longer looks like a selected state');
});

test('random play picks its next song early and resolves its address while the current one plays', () => {
  assert.match(music, /const upcoming = playMode\.current === 'random' \? pickUpcomingRandom\(\) : upcomingListTrack\(\);/, 'Random play is no longer skipped');
  assert.match(music, /const track = unplayed\.find\(\(item\) => item\.songId === randomBatchRef\.current\.upcoming\) \|\| unplayed\[/, 'The switch plays the song picked ahead');
  assert.match(music, /if \(ready\) \{ startRandomBatch\(ready\.tracks, ready\.singer, ready\.upcoming\); return; \}/, 'A new batch starts at the song picked ahead');
  assert.match(music, /batch\.next = \{ tracks, singer: payload\.singer \|\| '', upcoming: '' \}; resolveUpcomingTrack\(\);/, 'A batch requested ahead resolves its first song early');
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
  assert.match(music, /const shownTitle = randomLoading \? '正在挑选下一首…' : shownTrack\?\.title;/, 'Waiting for a random batch does not keep the previous title');
  assert.match(music, /<span className="music-visually-hidden" role="status">\{playbackAnnouncement\}<\/span>/, 'Screen readers hear the state');
  assert.match(music, /className=\{`music-player__progress\$\{isPlaybackBusy \? ' is-pending' : ''\}`\}/);
  assert.match(music, /className=\{`music-app-now__seek\$\{isPlaybackBusy \? ' is-pending' : ''\}`\}/, 'The full-screen seek bar shows the same loading sweep');
  assert.match(player, /\.music-app-now__seek\.is-pending input \{[^}]*animation: music-progress-pending/);
  assert.match(player, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?:is\(\.music-app-player \.music-player__progress, \.music-app-now__seek\)\.is-pending input \{ animation: none;/);
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

test('the first tap on the page unlocks the audio element for iOS Safari', () => {
  assert.match(music, /const gestures = \['touchend', 'click', 'keydown'\];/, 'Only events that count as a user activation');
  assert.match(music, /if \(!media\.getAttribute\('src'\)\) media\.load\(\);\s*release\(\);/, 'Loads the element only while it is still empty, then stops listening');
  assert.match(music, /gestures\.forEach\(\(name\) => document\.addEventListener\(name, unlock, true\)\);/, 'Capture phase, so it runs before the tapped button starts a song');
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
  assert.match(music, /function randomRequestParams\(preferences = randomPreferences\) \{ return \{ exclude: randomSingers\.current\.join\(','\), era: preferences\.era, languages: preferences\.languages\.join\(','\) \}; \}/);
  assert.match(music, /musicRequest\('random', randomRequestParams\(\), controller\.signal\)/, 'The home button sends the preferences');
  assert.match(music, /function requestNextRandomBatch\(preferences = randomPreferences\) \{[\s\S]*?musicRequest\('random', randomRequestParams\(preferences\), controller\.signal\)/, 'So does the batch requested ahead');
  assert.match(music, /updateLibrary\(\(value\) => \(\{ \.\.\.value, settings: \{ \.\.\.\(value\.settings \|\| \{\}\), randomPreferences: next \} \}\)\);\s*const batch = randomBatchRef\.current;\s*batch\.request\?\.abort\(\); batch\.request = null; batch\.next = null;/, 'Saved in the synced library; a batch requested with old preferences is dropped');
  assert.match(music, /if \(playMode\.current !== 'random'\) return;\s*batch\.tracks = batch\.tracks\.filter\(\(track\) => track\.songId === currentId\);\s*requestNextRandomBatch\(next\);/, 'During random play the next song already follows the new preferences');
  const settings = music.slice(music.indexOf("{listView === 'settings' &&"), music.indexOf("{!['playlists', 'settings', 'random'].includes(listView)"));
  assert.match(settings, /<div className="music-app-settings__column"><section className="music-app-settings__random"/, 'Guests can set it too');
  assert.match(settings, /\[\['', '不限'\], \.\.\.RANDOM_LANGUAGE_OPTIONS\]/);
  assert.match(music, /const RANDOM_ERA_OPTIONS = \[\['any', '不限'\], \['new', '新歌优先'\], \['classic', '经典老歌'\]\];/, '不限 leads both groups');
});
