// 開発用: 保存済みHTMLを解析して結果を確認する
import fs from 'node:fs';
import { parseListPage } from './lib/parse-list.mjs';
const file = process.argv[2];
const title = process.argv[3] || file.split('/').pop().replace(/\.html$/, '').replace(/_/g, ' ');
const { rows, stats } = parseListPage(fs.readFileSync(file, 'utf8'), title);
console.log(JSON.stringify(stats));
const n = Number(process.argv[4] || 5);
for (const r of [...rows.slice(0, n), ...rows.slice(-n)]) console.log(JSON.stringify(r));
