/**
 * 発売日順クリア企画：Google スプレッドシート（CSV）の記録を取り込み、data/playlog.json を作ります。
 *
 * 使い方:
 *   node scripts/playlog/import-sheet.mjs              … src/config/playlog.ts の sheetCsvUrl から取り込む
 *   node scripts/playlog/import-sheet.mjs --file x.csv … 手元のCSVファイルから取り込む
 *   --force を付けると、記録の数が大きく減っていても保存します（通常は安全のため止まります）
 *
 * スプレッドシートの1行目は見出しで、次の列を使います（列の順番は自由。ない列は空欄扱い）:
 *   機種 / 番号 / タイトル / 状態 / クリア日 / 動画URL / ひとこと / ID
 * 「ID」が空欄の行は、「機種」と「タイトル」からソフトを探します。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ensureProxySupport } from '../import/lib/http.mjs';
import { playlog as config } from '../../src/config/playlog.ts';
import { createPlatformResolver, extractVideos, loadCatalog, parseCsv, pickGame } from './lib.mjs';

ensureProxySupport();

const OUT = 'data/playlog.json';
const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;

const fail = (msg) => {
  console.error(`\n⚠ ${msg}`);
  process.exit(1);
};

// ---- スプレッドシートを読む ---------------------------------------------------
let csv;
if (file) {
  csv = readFileSync(file, 'utf8');
} else {
  if (!config.sheetCsvUrl) {
    console.log('スプレッドシートのURL（src/config/playlog.ts の sheetCsvUrl）が未設定のため、取り込みは行いません。');
    process.exit(0);
  }
  const res = await fetch(config.sheetCsvUrl, { redirect: 'follow' }).catch((e) => fail(`スプレッドシートを読み込めませんでした（${e.message}）`));
  if (!res.ok) fail(`スプレッドシートを読み込めませんでした（HTTP ${res.status}）。URLが正しいか、「ウェブに公開」されているか確認してください。`);
  csv = await res.text();
  if (/^\s*</.test(csv)) fail('CSVではなくWebページが返ってきました。「ウェブに公開」で形式に「カンマ区切り形式（.csv）」を選んだURLか確認してください。');
}

// ---- 見出しから列を探す -------------------------------------------------------
const COLUMNS = {
  platform: ['機種', 'ハード', 'プラットフォーム'],
  num: ['番号', '#', 'No', 'No.', '通し番号'],
  title: ['タイトル', 'ソフト名', 'ゲーム名', 'ソフト'],
  status: ['状態', 'ステータス', '進行状況'],
  clearedAt: ['クリア日', 'クリアした日'],
  videos: ['動画URL', '動画', 'YouTube', 'URL'],
  comment: ['ひとこと', '感想', 'コメント'],
  id: ['ID', 'ソフトID'],
};
const key = (s) => String(s ?? '').normalize('NFKC').replace(/\s/g, '').toLowerCase();
const rows = parseCsv(csv);
const headerIndex = rows.findIndex((r) => r.some((c) => key(c) === key('タイトル') || key(c) === key('ID')));
if (headerIndex < 0) fail('見出しの行（「機種」「タイトル」など）が見つかりません。1行目に見出しがあるか確認してください。');
const header = rows[headerIndex].map(key);
const col = {};
for (const [name, aliases] of Object.entries(COLUMNS)) col[name] = header.findIndex((h) => aliases.some((a) => key(a) === h));

// ---- 1行ずつソフトと結び付ける ------------------------------------------------
const STATUS = {
  clear: ['クリア', 'クリア済み', 'クリア済', '済', '済み', '完了', 'clear', 'cleared', 'end', 'done', '✓', '○', '◯'],
  playing: ['挑戦中', 'プレイ中', '進行中', '途中', 'playing'],
  hold: ['保留', '中断', '休止', '断念', 'ギブアップ', 'スキップ', 'hold', 'skip'],
  extra: ['企画外', '番外', '番外編', 'おまけ', 'extra'],
};
const statusOf = (s) => {
  const k = key(s);
  if (!k) return 'playing';
  for (const [st, words] of Object.entries(STATUS)) if (words.some((w) => key(w) === k)) return st;
  return null;
};
const parseDay = (s) => {
  const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(String(s ?? '').normalize('NFKC'));
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(d)) ? null : d;
};

const cat = loadCatalog();
const resolvePlatform = createPlatformResolver(cat.platforms);
const issues = [];
const records = new Map();
const RANK = { clear: 4, playing: 3, hold: 2, extra: 1 };

for (let i = headerIndex + 1; i < rows.length; i++) {
  const r = rows[i];
  const cell = (name) => (col[name] >= 0 ? String(r[col[name]] ?? '').trim() : '');
  if (!r.some((c) => String(c).trim())) continue;
  const rowNo = i + 1;
  const base = { row: rowNo, platform: cell('platform'), title: cell('title') };
  const issue = (kind, message, extra = {}) => issues.push({ ...base, kind, message, ...extra });

  // ソフトを決める（ID列 → 機種＋タイトル の順）
  let game = null;
  const idText = cell('id');
  if (idText) {
    const m = /([a-z0-9]+-\d+)\/?\s*$/i.exec(idText);
    game = m ? cat.games.get(m[1].toLowerCase()) : null;
    if (!game) issue('id', `ID「${idText}」のソフトが見つかりません。タイトルから探しました。`);
  }
  if (!game) {
    const pid = resolvePlatform(base.platform);
    if (!pid) {
      issue('platform', base.platform ? `機種「${base.platform}」が分かりません。` : '機種が空欄です。');
      continue;
    }
    if (!base.title) {
      issue('title', 'タイトルが空欄です。');
      continue;
    }
    const pick = pickGame(base.title, '', cat.byPlatform.get(pid) ?? []);
    const cands = pick.candidates.map((c) => ({ id: c.game.id, title: c.game.title, date: c.game.date }));
    if (pick.kind === 'notfound') {
      issue('notfound', 'ソフトが見つかりません。タイトルを直すか、ID列にソフトのIDを入力してください。', { candidates: cands });
      continue;
    }
    game = pick.game;
    if (pick.kind === 'ambiguous') issue('ambiguous', `同じタイトルのソフトが複数あるため「${game.title}」（${game.date ?? '発売日未定'}）にしました。違う場合はID列にIDを入力してください。`, { id: game.id, candidates: cands });
    if (pick.kind === 'guess') issue('guess', `「${game.title}」のことだと判断しました。違う場合はID列にIDを入力してください。`, { id: game.id, candidates: cands });
  }

  let status = statusOf(cell('status'));
  if (!status) {
    issue('status', `状態「${cell('status')}」が分かりません（クリア・挑戦中・保留・企画外 のどれかにしてください）。挑戦中として扱いました。`, { id: game.id });
    status = 'playing';
  }
  const clearedAt = parseDay(cell('clearedAt'));
  if (cell('clearedAt') && !clearedAt) issue('date', `クリア日「${cell('clearedAt')}」を日付として読めませんでした（例: 2026/10/04）。`, { id: game.id });
  const numText = cell('num').normalize('NFKC').match(/\d+/);
  const rec = {
    id: game.id,
    num: numText ? Number(numText[0]) : undefined,
    status,
    clearedAt: clearedAt ?? undefined,
    comment: cell('comment') || undefined,
    videos: extractVideos(cell('videos')),
  };

  // 同じソフトの行が複数あるときは1つにまとめる
  const prev = records.get(game.id);
  if (!prev) records.set(game.id, rec);
  else {
    prev.videos.push(...rec.videos.filter((v) => !prev.videos.some((p) => (p.yt ?? p.url) === (v.yt ?? v.url))));
    if (RANK[rec.status] > RANK[prev.status]) prev.status = rec.status;
    prev.num ??= rec.num;
    if (rec.clearedAt && (!prev.clearedAt || rec.clearedAt > prev.clearedAt)) prev.clearedAt = rec.clearedAt;
    if (rec.comment && rec.comment !== prev.comment) prev.comment = prev.comment ? `${prev.comment} ${rec.comment}` : rec.comment;
  }
}

// ---- 動画のタイトル（前回の取り込み結果を使い回し、新しい動画だけ YouTube に問い合わせる） ----
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { records: [], issues: [], videoTitles: {} };
const known = { ...(previous.videoTitles ?? {}) };
if (args.includes('--titles')) Object.assign(known, JSON.parse(readFileSync(args[args.indexOf('--titles') + 1], 'utf8')));
const used = [...new Set([...records.values()].flatMap((r) => r.videos.filter((v) => v.yt).map((v) => v.yt)))];
const missing = used.filter((id) => !known[id]).slice(0, 200);
for (let i = 0; i < missing.length; i += 4) {
  await Promise.all(
    missing.slice(i, i + 4).map(async (id) => {
      try {
        const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) known[id] = (await res.json()).title;
      } catch {
        // タイトルが取れなくても表示はできるので無視
      }
    }),
  );
}
const videoTitles = Object.fromEntries(used.filter((id) => known[id]).sort().map((id) => [id, known[id]]));

// ---- 並べ替え・安全確認・保存 -------------------------------------------------
const order = new Map(cat.platforms.map((p, i) => [p.id, i]));
const list = [...records.values()].sort((a, b) => {
  const ga = cat.games.get(a.id);
  const gb = cat.games.get(b.id);
  return order.get(ga.platform) - order.get(gb.platform) || (a.num ?? 1e9) - (b.num ?? 1e9) || a.id.localeCompare(b.id, 'en', { numeric: true });
});
const prevCount = previous.records?.length ?? 0;
if (!force && prevCount >= 20 && list.length < prevCount * 0.5) {
  fail(`記録が ${prevCount}件 から ${list.length}件 に大きく減っています。スプレッドシートの行を消していないか確認してください。\n（正しい場合は、Actions の「プレイ記録を取り込む」を手動実行し「記録が減っていても保存する」にチェックを入れます）`);
}

const same = JSON.stringify({ r: previous.records, i: previous.issues, v: previous.videoTitles }) === JSON.stringify({ r: list, i: issues, v: videoTitles });
const counts = Object.fromEntries(Object.keys(RANK).map((s) => [s, list.filter((r) => r.status === s).length]));
console.log(`記録 ${list.length}件（クリア ${counts.clear}・挑戦中 ${counts.playing}・保留 ${counts.hold}・企画外 ${counts.extra}）`);
if (issues.length) {
  console.log(`確認が必要な行 ${issues.length}件:`);
  for (const x of issues) console.log(`  ${x.row}行目 [${x.platform}] ${x.title} … ${x.message}`);
}
if (same) {
  console.log('前回から変更はありません。');
  process.exit(0);
}

const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19) + '+09:00';
const lines = (arr) => arr.map((x) => JSON.stringify(x)).join(',\n');
const json = `{
"updatedAt": ${JSON.stringify(jst)},
"records": [
${lines(list)}
],
"issues": [
${lines(issues)}
],
"videoTitles": {
${Object.entries(videoTitles).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}
}
}
`;
writeFileSync(OUT, json);
console.log(`${OUT} を保存しました。`);
