/**
 * HTTP取得の共通処理（User-Agentの付与、混雑時の自動リトライ、プロキシ環境への対応）
 */
import { spawnSync } from 'node:child_process';

export const USER_AGENT =
  'GameDatabaseSiteImporter/1.0 (+https://github.com/swordartonline0967-cmd/website)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HTTPS_PROXY が設定された環境（クラウド開発環境など）では、Node.js の fetch が
 * プロキシを使うように NODE_USE_ENV_PROXY=1 を付けて自分自身を起動し直す。
 * 普通のパソコンや GitHub Actions では何もしない。
 */
export function ensureProxySupport() {
  const hasProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!hasProxy || process.env.NODE_USE_ENV_PROXY) return;
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(r.status ?? 1);
}

/**
 * fetch + リトライ。429（アクセス過多）や5xxのときは待ってから再試行する。
 */
export async function fetchWithRetry(url, { method = 'GET', headers = {}, body, retries = 8, label = url } = {}) {
  let wait = 5000;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { method, body, headers: { 'User-Agent': USER_AGENT, ...headers } });
    } catch (e) {
      if (attempt >= retries) throw e;
      console.warn(`  ! 通信エラー（${e.cause?.code || e.message}）: ${label} … ${wait / 1000}秒後に再試行`);
      await sleep(wait);
      wait = Math.min(wait * 2, 120000);
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : wait;
      console.warn(`  ! HTTP ${res.status}: ${label} … ${Math.round(ms / 1000)}秒後に再試行`);
      await sleep(ms);
      wait = Math.min(wait * 2, 120000);
      continue;
    }
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status}: ${label}\n${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
}
