import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NETEASE_URL = 'https://music.163.com/api/v1/artist/list';
const QQ_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const REPORT_NOTES = `\n## 筛选字段与前端加载\n\n网易云分类记录包含 musicSize（歌曲数）和 albumSize（专辑数）。QQ 分类记录不含这两个数字，但批量 \`Concern.ConcernSystemServer/cgi_qry_concern_num\` 接口可返回 user_fansnum（关注数）。单个 QQ 歌手的 \`musichall.song_list_server/GetSingerSongList\` 还能返回 totalNum（歌曲总数）；逐个查询成本更高，因此未作为默认筛选。\n\n歌手池只包含显示名和预计算的拼音首字母，由应用静态加载；输入搜索词时不发第三方网络请求。名称和拼音都可能与平台后续数据不同，更新时重新运行脚本。\n`;
const BROAD = process.argv.includes('--all');
const NETEASE_PER_CATEGORY = BROAD ? 1000 : 200;
const QQ_MIN_FANS = 1000;
const NETEASE_MIN_SONGS = 10;
const PAGE_SIZE = 100;
const QQ_PAGE_SIZE = 80;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function getJson(url, referer) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json, text/plain, */*', referer, 'user-agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

function qqRequest(name, module, method, param) {
  const url = new URL(QQ_URL);
  url.searchParams.set('data', JSON.stringify({ comm: { cv: 1602, ct: 20 }, [name]: { module, method, param } }));
  return getJson(url, 'https://y.qq.com/').then((payload) => {
    if (payload.code !== 0 || payload[name]?.code !== 0) throw new Error(`QQ Music ${method} failed`);
    return payload[name].data;
  });
}

export function normalizeSingerName(value) {
  return String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '').trim().replace(/\s+/gu, ' ');
}

function addSinger(pool, raw, score = 0) {
  const name = normalizeSingerName(raw);
  const key = name.toLocaleLowerCase();
  if (key && (!pool.has(key) || score > pool.get(key).score)) pool.set(key, { name, score });
}

async function fetchNetease() {
  const pool = new Map();
  const categories = [];
  for (const type of [1, 2, 3]) for (const area of [7, 96, 8, 16, 0]) {
    let received = 0;
    let kept = 0;
    let more = false;
    for (let offset = 0; offset < NETEASE_PER_CATEGORY; offset += PAGE_SIZE) {
      const url = new URL(NETEASE_URL);
      for (const [key, value] of Object.entries({ type, area, initial: -1, limit: PAGE_SIZE, offset })) url.searchParams.set(key, value);
      const payload = await getJson(url, 'https://music.163.com/');
      if (payload.code !== 200 || !Array.isArray(payload.artists)) throw new Error(`NetEase artist list failed: ${url}`);
      received += payload.artists.length;
      more = payload.more === true;
      for (const artist of payload.artists) {
        if (BROAD || Number(artist.musicSize) >= NETEASE_MIN_SONGS) {
          addSinger(pool, artist.name);
          kept += 1;
        }
      }
      if (!more || payload.artists.length < PAGE_SIZE) break;
      await sleep(60);
    }
    categories.push({ type, area, received, kept, more });
    console.log(`NetEase ${type}/${area}: ${received} rows, ${kept} qualified`);
  }
  return { pool, categories };
}

async function fetchQq() {
  const pool = new Map();
  let total = null;
  let received = 0;
  let qualified = 0;
  for (let offset = 0; total === null || offset < total; offset += QQ_PAGE_SIZE) {
    const data = await qqRequest('singer', 'Music.SingerListServer', 'get_singer_list', {
      area: -100, sex: -100, genre: -100, index: -100, sin: offset, cur_page: 1 + Math.floor(offset / QQ_PAGE_SIZE),
    });
    if (!Array.isArray(data?.singerlist) || !Number.isInteger(data.total) || !data.singerlist.length) throw new Error(`QQ artist list failed at ${offset}`);
    if (total !== null && total !== data.total) throw new Error(`QQ artist total changed: ${total} -> ${data.total}`);
    total = data.total;
    received += data.singerlist.length;
    if (BROAD) {
      data.singerlist.forEach((artist) => addSinger(pool, artist.singer_name));
      qualified += data.singerlist.length;
    } else {
      const fans = await qqRequest('fans', 'Concern.ConcernSystemServer', 'cgi_qry_concern_num', {
        vec_userinfo: data.singerlist.map((artist) => ({ usertype: 1, userid: artist.singer_mid })),
      });
      if (!fans?.map_singer_num) throw new Error(`QQ fan counts unavailable at ${offset}`);
      for (const artist of data.singerlist) {
        const fanCount = Number(fans.map_singer_num[artist.singer_mid]?.user_fansnum);
        if (fanCount >= QQ_MIN_FANS) {
          addSinger(pool, artist.singer_name, fanCount);
          qualified += 1;
        }
      }
    }
    if (offset % 1600 === 0) console.log(`QQ Music ${Math.min(offset + QQ_PAGE_SIZE, total)}/${total}`);
    await sleep(60);
  }
  return { pool, total, received, qualified };
}

function initials(name) {
  return pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function singerModule(pool, timestamp) {
  const names = [...pool.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hans-CN')).map((item) => item.name);
  return `// Generated by npm run update:singers at ${timestamp}.\n// [name, precomputed pinyin initials]\nexport const SINGERS = [\n${names.map((name) => `  [${JSON.stringify(name)},${JSON.stringify(initials(name))}],`).join('\n')}\n];\n`;
}

function report(netease, qq, merged, timestamp) {
  const rows = netease.categories.map((row) => `| ${row.type} | ${row.area} | ${row.received} | ${row.kept} | ${row.more ? '是' : '否'} |`).join('\n');
  const neteaseRows = netease.categories.reduce((sum, row) => sum + row.received, 0);
  return `# 本地歌手池抓取统计\n\n- 抓取时间（UTC）：${timestamp}\n- 模式：${BROAD ? '广覆盖（--all）' : '作品量与关注数筛选'}\n- 网易云分类：15 个类型/地区组合，共返回 ${neteaseRows} 条，筛选后名称去重 ${netease.pool.size} 名。\n- QQ 全部歌手分类：接口报告 ${qq.total} 条，实际返回 ${qq.received} 条，筛选后 ${qq.qualified} 条、名称去重 ${qq.pool.size} 名。\n- 合并去重：${merged.size} 名。\n\n默认口径：网易云各分类前 ${NETEASE_PER_CATEGORY} 条，且歌曲数 ≥ ${NETEASE_MIN_SONGS}；QQ 抓取全部分类页，仅保留关注数 ≥ ${QQ_MIN_FANS} 的歌手。关注数与作品量只是可核验的筛选指标，不能准确判定歌手身份或作品质量。\n\n运行 \`npm run update:singers -- --all\` 可抓取 QQ 分类接口全部返回条目和网易云每类前 1000 条。网易云接口每页最多有效返回 100 条，offset=900 仍可能显示 more=true，但 offset=1000 返回空页；因此单个分类不能保证全量。QQ 接口按 total 分页，每页实际返回 80 条。上述接口只在更新本地数据时使用，浏览器联想不请求第三方。\n\n去重：歌手名经 Unicode NFKC、零宽字符清理、空白合并、不区分大小写后比较；拼音首字母由 pinyin-pro 在更新时预计算。\n\n## 网易云分类明细\n\n| 类型 | 地区 | 返回条目 | 满足条件 | 仍有后续 |\n| ---: | ---: | ---: | ---: | :---: |\n${rows}\n`;
}

async function main() {
  const timestamp = new Date().toISOString();
  const [netease, qq] = await Promise.all([fetchNetease(), fetchQq()]);
  const merged = new Map(netease.pool);
  for (const [key, singer] of qq.pool) if (!merged.has(key) || singer.score > merged.get(key).score) merged.set(key, singer);
  const singerPath = resolve(ROOT, 'src/data/singers.js');
  const reportPath = resolve(ROOT, 'docs/singer-pool-stats.md');
  await mkdir(dirname(singerPath), { recursive: true });
  await writeFile(singerPath, singerModule(merged, timestamp), 'utf8');
  await writeFile(reportPath, report(netease, qq, merged, timestamp) + REPORT_NOTES, 'utf8');
  console.log(JSON.stringify({ netease: netease.pool.size, qq: qq.pool.size, merged: merged.size }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
