/**
 * クリア記録（data/clears/<ソフトID>/）の書式チェック
 * クリア側が push する前に実行すると、表示されない原因（フォルダ名の間違い・画像の不足など）が分かります。
 *
 * 使い方: node scripts/clears/check.mjs [フォルダ名 ...]
 *   エラーがあると終了コード1（そのソフトはサイトに表示されません）。注意は表示のみ。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '../playlog/lib.mjs';

const ROOT = process.env.CLEARS_DIR ?? 'data/clears';
const HEADINGS = ['このゲームについて', '操作方法', 'チャート', '攻略法', '敵・アイテム', 'マップ', '小技・裏技', 'パラメータ', '動画について'];
// サイトに出す文に入れない言葉（クリア側の決まり）。見つけたら注意を出す
const AVOID = [/(^|[^A-Za-z])AI([^A-Za-z]|$)/, /人工知能/, /エミュレー?タ/, /emulat/i, /(^|[^A-Za-z])TAS([^A-Za-z]|$)/, /強化学習/, /ステートセーブ|セーブステート/];
const MAX_FILE = 25 * 1024 * 1024;
const MAX_GAME = 3 * 1024 * 1024;

const { games } = loadCatalog();
const targets = process.argv.slice(2).length ? process.argv.slice(2) : existsSync(ROOT) ? readdirSync(ROOT).filter((d) => statSync(path.join(ROOT, d)).isDirectory()) : [];
let errors = 0;
let warnings = 0;
const norm = (s) => String(s).normalize('NFKC').replace(/\s+/g, ' ').trim();

for (const slug of targets.sort()) {
  const dir = path.join(ROOT, slug);
  const err = (m) => (errors++, console.log(`  ✗ ${m}`));
  const warn = (m) => (warnings++, console.log(`  △ ${m}`));
  console.log(`■ ${slug}`);
  const game = games.get(slug);
  if (!game) err('このソフトIDはサイトにありません（フォルダ名＝ソフトID。/data/games.csv の slug を使います）');
  const file = path.join(dir, 'site.json');
  if (!existsSync(file)) {
    err('site.json がありません');
    continue;
  }
  let s;
  try {
    s = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(`site.json がJSONとして読めません（${e.message}）`);
    continue;
  }
  if (s.slug && s.slug !== slug) err(`site.json の slug「${s.slug}」とフォルダ名が違います`);
  if (game && s.title && norm(s.title) !== norm(game.title)) warn(`題名がサイトと違います（site.json「${s.title}」／サイト「${game.title}」）。表示はサイトの題名です`);
  if (!s.record || typeof s.record !== 'object') warn('record（クリア記録）がありません');
  if (s.video?.youtube_id && !/^[\w-]{11}$/.test(s.video.youtube_id)) err(`video.youtube_id「${s.video.youtube_id}」は YouTube の動画IDの形ではありません`);
  if (!s.video?.youtube_id) warn('動画（video.youtube_id）がありません');

  const chapters = Array.isArray(s.chapters) ? s.chapters : [];
  chapters.forEach((c, i) => {
    if (!Number.isFinite(Number(c?.seconds)) || Number(c.seconds) < 0) err(`chapters[${i}] の seconds が数字ではありません`);
    if (!c?.title) err(`chapters[${i}] に title がありません`);
    if (i > 0 && Number(c.seconds) < Number(chapters[i - 1].seconds)) warn(`chapters[${i}] の秒数が前のチャプターより小さくなっています`);
  });

  const md = typeof s.guide_md === 'string' ? s.guide_md : '';
  if (!md) warn('guide_md（攻略記事）がありません');
  let section = '';
  const chartTitles = [];
  for (const line of md.split(/\r?\n/)) {
    const h2 = /^##\s+(.+?)\s*#*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*#*$/.exec(line);
    if (h2 && !line.startsWith('###')) {
      section = h2[1].trim();
      if (!HEADINGS.includes(section)) warn(`見出し「## ${section}」は決まった見出しにありません`);
    } else if (h3 && section === 'チャート') chartTitles.push(h3[1].trim());
  }
  for (const t of chartTitles) if (!chapters.some((c) => norm(c.title) === norm(t))) warn(`チャートの見出し「### ${t}」と同じ title のチャプターがありません（動画への頭出しが付きません）`);

  const shotsDir = path.join(dir, 'shots');
  const shotFiles = existsSync(shotsDir) ? readdirSync(shotsDir) : [];
  const images = Array.isArray(s.images) ? s.images : [];
  let total = 0;
  for (const img of images) {
    const name = String(img?.file ?? '').split('/').pop();
    if (!/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(name)) {
      err(`画像のファイル名「${img?.file}」は使えません（半角英数字・. _ - のみ、png/jpg/gif/webp）`);
      continue;
    }
    if (!shotFiles.includes(name)) {
      err(`images にある「${name}」が shots/ にありません`);
      continue;
    }
    const size = statSync(path.join(shotsDir, name)).size;
    total += size;
    if (size > MAX_FILE) err(`「${name}」が25MiBを超えています`);
    if (!img.width || !img.height) warn(`「${name}」の width / height がありません（表示が少しずれます）`);
  }
  const listed = new Set(images.map((i) => String(i?.file ?? '').split('/').pop()));
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    const name = m[1].split('/').pop().split('?')[0];
    if (!listed.has(name)) warn(`記事の画像「${name}」が images にありません（表示されません）`);
  }
  if (total > MAX_GAME) warn(`画像の合計が ${(total / 1024 / 1024).toFixed(1)}MB あります（目安は1本3MBまで）`);

  const shown = [md, s.record?.criterion, s.record?.result, ...(chapters.map((c) => c?.title) ?? []), s.video?.title, ...(images.map((i) => i?.alt) ?? [])]
    .concat(Array.isArray(s.record?.losses) ? s.record.losses.map((x) => JSON.stringify(x)) : [])
    .concat(Array.isArray(s.record?.fast_forward) ? s.record.fast_forward.map((x) => JSON.stringify(x)) : [])
    .filter(Boolean)
    .join('\n');
  for (const re of AVOID) {
    const m = re.exec(shown);
    if (m) warn(`サイトに出す文に「${m[0].trim()}」が入っています`);
  }
}

console.log(`\n${targets.length}本を確認：エラー ${errors}件・注意 ${warnings}件`);
process.exit(errors ? 1 : 0);
