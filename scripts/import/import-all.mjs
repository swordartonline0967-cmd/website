/**
 * データ更新をまとめて実行します。
 *   1) Wikipediaから全機種のソフト一覧を取り込み
 *   2) Wikidataからジャンル・開発元を補完
 *   3) データの検証
 * 使い方: npm run data:import
 */
import { spawnSync } from 'node:child_process';

const steps = [
  ['Wikipediaから取り込み', 'scripts/import/import-wikipedia.mjs'],
  ['Wikidataで補完', 'scripts/import/enrich-wikidata.mjs'],
  ['データの検証', 'scripts/validate-data.mjs'],
];
const extra = process.argv.slice(2);
for (const [label, script] of steps) {
  console.log(`\n========== ${label} ==========`);
  const r = spawnSync(process.execPath, [script, ...extra], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n「${label}」でエラーが発生したため中断しました。`);
    process.exit(r.status ?? 1);
  }
}
console.log('\nすべて完了しました。');
