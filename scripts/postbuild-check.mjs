/**
 * ビルド後に、出力（dist フォルダ）のファイル数と容量を表示します。
 * 公開先の上限（Cloudflare無料プラン: 2万ファイル / GitHub Pages: 1GB）に近づいたら警告します。
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
let files = 0;
let bytes = 0;
let largest = { size: 0, file: '' };
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else {
      files++;
      const s = fs.statSync(p).size;
      bytes += s;
      if (s > largest.size) largest = { size: s, file: path.relative(dist, p) };
    }
  }
};
walk(dist);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;
console.log(`\n📦 ビルド結果: ${files.toLocaleString()}ファイル / ${mb(bytes)}（最大: ${largest.file} ${mb(largest.size)}）`);
if (files > 20000) console.log('   ℹ Cloudflare の無料プラン（2万ファイルまで）では公開できません。GitHub Pages か Cloudflare の有料プラン（Workers Paid）を使ってください。');
if (files > 95000) console.warn('   ⚠ Cloudflare 有料プランの上限（10万ファイル）に近づいています。');
if (bytes > 900 * 1024 * 1024) console.warn('   ⚠ GitHub Pages の上限（1GB）に近づいています。');
if (largest.size > 24 * 1024 * 1024) console.warn('   ⚠ 25MBを超えるファイルは Cloudflare で公開できません。');
