/**
 * 取り込んだ行データを既存の data/games/<機種>.json と統合する。
 * ★いちど割り当てたID（URL）は変えない★ ことが最重要。
 *   - 既存データと「同じソフト」と判定できたら、そのIDを引き継ぐ
 *   - 新しく見つかったソフトには、その機種の最大番号+1 のIDを振る
 *   - lock: true の行は上書きしない（手修正の保護）
 *   - source: 'manual'（手入力）の行はそのまま残す
 */
import { similarity, titleKey } from './normalize.mjs';

/** 取り込みで上書きするフィールド（これ以外＝説明文などの手入力項目は保持） */
const IMPORTED_FIELDS = ['title', 'date', 'dateNote', 'publishers', 'cero', 'digitalOnly', 'format', 'note', 'altTitles', 'overseas', 'wiki', 'source', 'genreText', 'price'];

function sortKey(date) {
  if (!date) return '9999-99-99';
  if (date.length === 4) return `${date}-99-99`;
  if (date.length === 7) return `${date}-99`;
  return date;
}
const collator = new Intl.Collator('ja');
export function compareRows(a, b) {
  const da = sortKey(a.date);
  const db = sortKey(b.date);
  if (da !== db) return da < db ? -1 : 1;
  return collator.compare(a.title, b.title);
}

/** 行データ → 保存用のソフトデータ */
export function rowToGame(row) {
  const g = {
    title: row.title,
    date: row.date ?? null,
    publishers: row.publishers ?? [],
  };
  if (row.tbd && row.dateRaw) g.dateNote = row.dateRaw;
  if (row.developers?.length) g.developers = row.developers;
  if (row.genreText) g.genreText = row.genreText;
  if (row.cero) g.cero = row.cero;
  if (row.price) g.price = row.price;
  if (row.digitalOnly) g.digitalOnly = true;
  if (row.format) g.format = row.format;
  if (row.note) g.note = row.note;
  if (row.altTitles?.length) g.altTitles = row.altTitles;
  if (row.wiki) g.wiki = row.wiki;
  g.source = row.source;
  return g;
}

/**
 * @param {object[]} existing 既存のソフト一覧
 * @param {object[]} rows 今回取り込んだ行（rowToGame 済み）
 * @param {string} pid 機種ID
 */
export function mergeGames(existing, rows, pid) {
  const stats = { matched: 0, added: 0, updated: 0, locked: 0, missing: 0 };
  let maxNum = 0;
  for (const g of existing) {
    const m = new RegExp(`^${pid}-(\\d+)$`).exec(g.id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }
  const used = new Set();
  const byKey = new Map();
  const byTitle = new Map();
  const byDate = new Map();
  const add = (map, k, g) => { if (!map.has(k)) map.set(k, []); map.get(k).push(g); };
  for (const g of existing) {
    const tk = titleKey(g.title);
    add(byKey, `${tk}|${g.date}`, g);
    add(byTitle, tk, g);
    add(byDate, g.date || '', g);
  }
  const firstUnused = (list) => list?.find((g) => !used.has(g.id));

  const findMatch = (row) => {
    const tk = titleKey(row.title);
    // 1) タイトル＋発売日が一致
    let m = firstUnused(byKey.get(`${tk}|${row.date}`));
    if (m) return m;
    // 2) タイトルが一致（発売日が修正された場合）… 候補が1件だけのとき
    const sameTitle = (byTitle.get(tk) || []).filter((g) => !used.has(g.id));
    if (sameTitle.length === 1) return sameTitle[0];
    // 3) 発売日が同じで、タイトルがよく似ている（誤字修正など）
    const sameDate = (byDate.get(row.date || '') || []).filter((g) => !used.has(g.id));
    let best = null;
    let bestScore = 0;
    for (const g of sameDate) {
      let s = similarity(titleKey(g.title), tk);
      if (row.wiki && g.wiki && row.wiki === g.wiki) s += 0.2;
      if (s > bestScore) { best = g; bestScore = s; }
    }
    if (best && bestScore >= 0.75) return best;
    return null;
  };

  const out = [];
  const sortedRows = [...rows].sort(compareRows);
  for (const row of sortedRows) {
    const match = findMatch(row);
    if (match) {
      used.add(match.id);
      stats.matched++;
      if (match.lock) { stats.locked++; out.push(match); continue; }
      let changed = false;
      for (const f of IMPORTED_FIELDS) {
        const before = JSON.stringify(match[f] ?? null);
        const after = JSON.stringify(row[f] ?? null);
        if (before !== after) {
          changed = true;
          if (row[f] === undefined || row[f] === null) delete match[f];
          else match[f] = row[f];
        }
      }
      delete match.missingFromSource;
      if (changed) stats.updated++;
      out.push(match);
    } else {
      stats.added++;
      out.push({ id: `${pid}-${++maxNum}`, ...row });
    }
  }
  for (const g of existing) {
    if (used.has(g.id)) continue;
    if (g.source !== 'manual' && !g.lock) {
      g.missingFromSource = true;
      stats.missing++;
    }
    out.push(g);
  }
  out.sort(compareRows);
  return { games: out, stats };
}
