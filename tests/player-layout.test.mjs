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
  assert.match(player, /\.music-app-now\.show-lyrics \.music-app-now__actions \{ display: none; \}/);
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
