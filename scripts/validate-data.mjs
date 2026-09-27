/**
 * data/ フォルダの中身をチェックします（手で編集したあとに実行すると安心です）。
 * 使い方: npm run data:validate
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.join(process.cwd(), 'data');
const errors = [];
const warnings = [];
const read = (rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
  } catch (e) {
    errors.push(`${rel} を読み込めません（JSONの書き方が間違っている可能性があります）: ${e.message}`);
    return null;
  }
};

const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const platforms = read('platforms.json') || [];
const genres = read('genres.json') || [];
const makers = read('makers.json') || [];
const genreIds = new Set(genres.map((g) => g.id));
const platformIds = new Set();
for (const p of platforms) {
  if (!/^[a-z0-9]+$/.test(p.id)) errors.push(`platforms.json: id「${p.id}」は英小文字と数字だけにしてください`);
  if (platformIds.has(p.id)) errors.push(`platforms.json: id「${p.id}」が重複しています`);
  platformIds.add(p.id);
  for (const k of ['name', 'shortName', 'maker', 'releaseDate', 'type', 'color', 'description']) {
    if (!p[k]) errors.push(`platforms.json: ${p.id} に ${k} がありません`);
  }
  if (p.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(p.releaseDate)) errors.push(`platforms.json: ${p.id} の releaseDate は YYYY-MM-DD 形式にしてください`);
}

const makerNames = new Set();
const makerIds = new Set();
for (const m of makers) {
  if (makerIds.has(m.id)) errors.push(`makers.json: id「${m.id}」が重複しています`);
  makerIds.add(m.id);
  makerNames.add(m.name);
  for (const a of m.aliases ?? []) makerNames.add(a);
}

const gameIds = new Set();
let total = 0;
const unknownMakers = new Set();
for (const p of platforms) {
  const rel = `games/${p.id}.json`;
  if (!fs.existsSync(path.join(DATA, rel))) continue;
  const games = read(rel) || [];
  total += games.length;
  games.forEach((g, i) => {
    const where = `${rel} の ${i + 1}件目（${g.id ?? 'IDなし'}）`;
    if (!g.id || !g.id.startsWith(`${p.id}-`)) errors.push(`${where}: id は「${p.id}-番号」の形にしてください`);
    if (gameIds.has(g.id)) errors.push(`${where}: id が重複しています`);
    gameIds.add(g.id);
    if (!g.title) errors.push(`${where}: title（タイトル）がありません`);
    if (g.date != null && !DATE_RE.test(g.date)) errors.push(`${where}: date「${g.date}」は YYYY-MM-DD / YYYY-MM / YYYY の形にしてください`);
    for (const gid of g.genres ?? []) if (!genreIds.has(gid)) errors.push(`${where}: ジャンル「${gid}」は genres.json にありません`);
    for (const n of [...(g.publishers ?? []), ...(g.developers ?? [])]) if (!makerNames.has(n)) unknownMakers.add(n);
  });
}
if (unknownMakers.size) warnings.push(`makers.json に登録されていないメーカー名が ${unknownMakers.size}件あります（ページは自動で作られます）: ${[...unknownMakers].slice(0, 10).join('、')}${unknownMakers.size > 10 ? ' …' : ''}`);

console.log(`機種 ${platforms.length} / ソフト ${total} / メーカー ${makers.length} / ジャンル ${genres.length}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors.slice(0, 50)) console.error(`✖ ${e}`);
  if (errors.length > 50) console.error(`…ほか ${errors.length - 50}件`);
  console.error(`\nエラーが ${errors.length}件あります。修正してください。`);
  process.exit(1);
}
console.log('✔ データに問題はありません');
