/**
 * Wikipedia日本語版のページ（Parsoid形式のHTML）を取得する。
 * 取得したHTMLは .cache/wikipedia/ に保存し、次回はそれを使う（負荷軽減のため）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchWithRetry, sleep } from './http.mjs';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'wikipedia');

export function cacheFileFor(title) {
  return path.join(CACHE_DIR, `${title.replace(/[/\\ :*?"<>|]/g, '_')}.html`);
}

let lastRequest = 0;

/**
 * @param {string} title ページ名
 * @param {{maxAgeDays?: number, refresh?: boolean}} opt
 */
export async function getWikipediaHtml(title, { maxAgeDays = 7, refresh = false } = {}) {
  const file = cacheFileFor(title);
  if (!refresh && fs.existsSync(file)) {
    const ageDays = (Date.now() - fs.statSync(file).mtimeMs) / 86400000;
    if (ageDays <= maxAgeDays) return fs.readFileSync(file, 'utf8');
  }
  // 連続アクセスを避けるため、前回から最低2秒あける
  const wait = lastRequest + 2000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();

  const enc = encodeURIComponent(title.replace(/ /g, '_'));
  const urls = [
    `https://ja.wikipedia.org/w/rest.php/v1/page/${enc}/html`,
    `https://ja.wikipedia.org/api/rest_v1/page/html/${enc}?redirect=true`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetchWithRetry(url, { label: title });
      const html = await res.text();
      if (!html.includes('<table')) throw new Error(`表が見つかりません: ${title}`);
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, html);
      return html;
    } catch (e) {
      lastErr = e;
      if (e.status === 404) break;
    }
  }
  throw lastErr;
}
