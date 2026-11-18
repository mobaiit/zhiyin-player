import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const music = readFileSync(new URL('../src/pages/Music.jsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/pages/MusicQ.css', import.meta.url), 'utf8');

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
  assert.match(layout, /\.music-player__heading \.music-player__title[\s\S]*?flex: 0 1 auto !important/);
  assert.match(layout, /@media \(max-width: 700px\)[\s\S]*?\.music-app-topbar h1[\s\S]*?font-size: 1\.08rem !important/);
  assert.match(layout, /\.music-app-now__meta h2[\s\S]*?font-size: clamp\(1\.15rem, 5\.1vw, 1\.48rem\) !important/);
});

test('desktop and mobile players use independent progress rows and non-overlapping lanes', () => {
  assert.match(layout, /Bottom player: one layout authority/);
  assert.match(layout, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) !important/);
  assert.match(layout, /\.music-player__progress\s*\{[\s\S]*?grid-column: 1 \/ -1 !important;[\s\S]*?grid-row: 2 !important/);
  assert.match(layout, /@media \(max-width: 700px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto 44px !important;[\s\S]*?grid-template-rows: 8px minmax\(0, 1fr\) !important/);
  assert.match(layout, /\.music-controls > \.play-button,[\s\S]*?\.music-player__next,[\s\S]*?\.music-download-button--mobile[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important/);
});

test('mobile now-playing uses swipe navigation and removes duplicate switch and queue actions', () => {
  const nowPlayer = music.slice(music.indexOf('<aside className={`music-app-now'), music.indexOf('</aside>', music.indexOf('<aside className={`music-app-now')));
  assert.match(music, /const startMobileNowSwipe/);
  assert.match(music, /Math\.abs\(deltaX\) < 48/);
  assert.match(nowPlayer, /onTouchStart=\{startMobileNowSwipe\}/);
  assert.match(nowPlayer, /onTouchEnd=\{finishMobileNowSwipe\}/);
  assert.doesNotMatch(nowPlayer, /music-app-now__lyrics-toggle/);
  assert.doesNotMatch(nowPlayer, /name="queue"/);
  assert.match(layout, /grid-template-areas:\s*"actions"\s*"seek"\s*"controls"/);
  assert.match(layout, /\.music-app-now\.show-lyrics \.music-app-now__actions\s*\{\s*display: none !important/);
});

test('mobile mini-player keeps accessible hit areas while drawing lighter controls', () => {
  assert.match(layout, /Compact mini player: large hit areas, visually lighter controls/);
  assert.match(layout, /height: 64px !important/);
  assert.match(layout, /\.music-controls > \.play-button::before[\s\S]*?inset: 5px/);
  assert.match(layout, /\.music-download-button[\s\S]*?background: transparent !important;[\s\S]*?box-shadow: none !important/);
});
