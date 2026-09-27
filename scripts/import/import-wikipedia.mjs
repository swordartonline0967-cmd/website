/**
 * Wikipedia日本語版の「◯◯のゲームタイトル一覧」からソフトを取り込み、
 * data/games/<機種ID>.json と data/makers.json を更新します。
 *
 * 使い方:
 *   npm run data:wikipedia            … 全機種
 *   npm run data:wikipedia -- fc sfc  … 指定した機種だけ
 *   オプション --refresh              … キャッシュを使わず取り直す
 */
import { ensureProxySupport } from './lib/http.mjs';
ensureProxySupport();

const { getWikipediaHtml } = await import('./lib/wikipedia.mjs');
const { parseListPage } = await import('./lib/parse-list.mjs');
const { mergeGames, rowToGame } = await import('./lib/merge.mjs');
const { titleKey } = await import('./lib/normalize.mjs');
const { orderKeys, readGames, readPlatforms, writeGames } = await import('./lib/store.mjs');
const { normalizeMakerName, updateMakers } = await import('./lib/makers.mjs');

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const only = args.filter((a) => !a.startsWith('--'));

const platforms = readPlatforms();
const targets = platforms.filter((p) => (p.sources?.length ?? 0) > 0 && (!only.length || only.includes(p.id)));
if (!targets.length) {
  console.error('対象の機種がありません。機種IDを確認してください:', only.join(', '));
  process.exit(1);
}

const linkVotes = new Map();
const summary = [];
for (const p of targets) {
  console.log(`\n■ ${p.name}（${p.id}）`);
  const rows = [];
  for (const src of p.sources) {
    const html = await getWikipediaHtml(src, { refresh });
    const { rows: r, stats } = parseListPage(html, src);
    console.log(`  - ${src}: ${stats.rows}件`);
    for (const row of r) rows.push({ ...row, source: src });
  }
  // 同じページ内・ページ間の重複をまとめる
  const uniq = new Map();
  for (const row of rows) {
    const k = `${titleKey(row.title)}|${row.date}`;
    const prev = uniq.get(k);
    if (!prev) { uniq.set(k, row); continue; }
    if (prev.digitalOnly && !row.digitalOnly) prev.digitalOnly = false; // どちらかでパッケージ版ありならパッケージ扱い
    if (!prev.wiki && row.wiki) prev.wiki = row.wiki;
  }
  // 本体の発売日より前の日付は、旧機種のソフト（互換対応タイトルなど）なので除外
  let early = 0;
  const deduped = [...uniq.values()].filter((row) => {
    if (row.date && row.date < p.releaseDate.slice(0, row.date.length)) { early++; return false; }
    return true;
  });
  if (early) console.log(`  （本体発売日より前の日付の ${early}件は除外）`);
  for (const row of deduped) {
    row.publishers = row.publishers.map(normalizeMakerName).filter(Boolean);
    if (row.developers) row.developers = row.developers.map(normalizeMakerName).filter(Boolean);
    row.publishers.forEach((name, i) => {
      const link = row.publisherLinks?.[i];
      if (!link) return;
      if (!linkVotes.has(name)) linkVotes.set(name, new Map());
      const v = linkVotes.get(name);
      v.set(link, (v.get(link) ?? 0) + 1);
    });
  }
  const { games, stats } = mergeGames(readGames(p.id), deduped.map(rowToGame), p.id);
  writeGames(p.id, games.map(orderKeys));
  summary.push({ id: p.id, total: games.length, ...stats });
  console.log(`  → 合計 ${games.length}件（新規 ${stats.added} / 更新 ${stats.updated} / 変更なし ${stats.matched - stats.updated} / 一覧から消えた ${stats.missing}）`);
}

// メーカー一覧を更新（全機種のデータから）
const allGames = platforms.flatMap((p) => readGames(p.id));
const mk = updateMakers(allGames, linkVotes);
console.log(`\nメーカー: ${mk.total}社（新規 ${mk.added}）`);
console.log('\n完了しました。');
console.table(summary);
