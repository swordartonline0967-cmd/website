/**
 * Wikidata（CC0ライセンスの共有データベース）への問い合わせ
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fetchWithRetry, sleep } from './http.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'wikidata');
const CACHE_DAYS = 7;
let last = 0;

/** SPARQLクエリを実行して bindings の配列を返す（結果は7日間キャッシュ） */
export async function sparql(query, label = 'Wikidata') {
  const key = crypto.createHash('sha1').update(query).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(file) && (Date.now() - fs.statSync(file).mtimeMs) / 86400000 < CACHE_DAYS) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const wait = last + 1500 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetchWithRetry(ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }).toString(),
    label,
  });
  const json = await res.json();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json.results.bindings));
  return json.results.bindings;
}

export const qid = (uri) => (uri ? uri.split('/').pop() : null);

/** SPARQLの文字列リテラル用エスケープ */
export function lit(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
