/**
 * data/makers.json（メーカー一覧）の更新。
 * メーカー名ごとに固定のIDを振ります（/makers/<ID>/ のURLになる）。
 */
import { readMakers, writeMakers } from './store.mjs';

export function normalizeMakerName(name) {
  return (name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * @param {object[]} allGames 全機種のソフト
 * @param {Map<string, Map<string, number>>} linkVotes メーカー名 → (Wikipedia記事名 → 出現数)
 */
export function updateMakers(allGames, linkVotes = new Map()) {
  const makers = readMakers();
  const byName = new Map();
  // 大文字・小文字だけが違う表記（Eastasiasoft / eastasiasoft など）は同じメーカーとして扱う
  const byLower = new Map();
  const register = (name, m) => {
    byName.set(name, m);
    if (!byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), m);
  };
  for (const m of makers) {
    register(m.name, m);
    for (const a of m.aliases ?? []) register(a, m);
  }
  let maxId = makers.reduce((mx, m) => Math.max(mx, Number(m.id) || 0), 0);

  const counts = new Map();
  for (const g of allGames) {
    for (const n of [...(g.publishers ?? []), ...(g.developers ?? [])]) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  // 本数の多い順にIDを振る（初回のみ意味がある。既存IDは変えない）
  const names = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b, 'ja'));
  let added = 0;
  for (const name of names) {
    if (byName.has(name)) continue;
    const sameLower = byLower.get(name.toLowerCase());
    if (sameLower) {
      sameLower.aliases = [...new Set([...(sameLower.aliases ?? []), name])];
      byName.set(name, sameLower);
      continue;
    }
    const m = { id: String(++maxId), name };
    const votes = linkVotes.get(name);
    if (votes && votes.size) {
      const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
      m.wiki = best[0];
    }
    makers.push(m);
    register(name, m);
    added++;
  }
  // wiki が未設定の既存メーカーにも補う
  for (const m of makers) {
    if (m.wiki) continue;
    const votes = linkVotes.get(m.name);
    if (votes && votes.size) m.wiki = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  makers.sort((a, b) => Number(a.id) - Number(b.id));
  writeMakers(makers);
  return { total: makers.length, added };
}
