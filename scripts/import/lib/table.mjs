/**
 * Wikipedia（Parsoid HTML）の表を扱うための小さなユーティリティ。
 * rowspan / colspan を展開して「行×列」の二次元配列にします。
 */
import { parse } from 'node-html-parser';

/** 表を行×列のグリッドに展開する。各要素は <td>/<th> ノード（結合セルは同じノードが複数入る） */
export function tableToGrid(table) {
  const rows = table.querySelectorAll('tr').filter((tr) => tr.closest('table') === table);
  const grid = [];
  const pending = [];
  for (const tr of rows) {
    const cells = tr.childNodes.filter((n) => n.tagName === 'TD' || n.tagName === 'TH');
    const out = [];
    let c = 0;
    let ci = 0;
    for (;;) {
      if (pending[c] && pending[c].remaining > 0) {
        out[c] = pending[c].cell;
        pending[c].remaining--;
        c++;
        continue;
      }
      if (ci >= cells.length) break;
      const cell = cells[ci++];
      const cs = clampInt(cell.getAttribute('colspan'), 1, 50);
      const rs = clampInt(cell.getAttribute('rowspan'), 1, 5000);
      for (let k = 0; k < cs; k++) {
        out[c] = cell;
        pending[c] = rs > 1 ? { cell, remaining: rs - 1 } : undefined;
        c++;
      }
    }
    grid.push({ tr, cells: out });
  }
  return grid;
}

function clampInt(v, min, max) {
  const n = parseInt(v || '', 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** 脚注・非表示要素などを取り除いたセルのクローンを返す */
function cleanClone(cell) {
  const clone = parse(cell.toString());
  for (const s of clone.querySelectorAll(
    'sup, style, link, script, .mw-ref, .reference, .sortkey, .noprint, .mw-editsection, [style*="display:none"], [style*="display: none"]',
  )) s.remove();
  return clone;
}

function squash(s) {
  return s
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** セルのテキスト（脚注や非表示要素を除く） */
export function cellText(cell) {
  if (!cell) return '';
  return squash(cleanClone(cell).text);
}

/**
 * セルを「行」に分けて返す。
 * 箇条書き（{{Unbulleted list}} → <li>）や <br> で区切られた複数行に対応。
 * 各行は { text, links: [{ target, text }] }
 */
export function cellLines(cell) {
  if (!cell) return [];
  const clone = cleanClone(cell);
  const lis = clone.querySelectorAll('li');
  let parts;
  if (lis.length) {
    parts = lis.map((li) => li.toString());
  } else {
    parts = clone.innerHTML.split(/<br\b[^>]*>/i);
  }
  const lines = [];
  for (const html of parts) {
    const node = parse(html);
    const text = squash(node.text);
    if (!text) continue;
    lines.push({ text, links: extractLinks(node) });
  }
  return lines;
}

/** ノード内のWikipedia記事へのリンクを取り出す（赤リンク・外部リンクは除く） */
export function extractLinks(node) {
  const out = [];
  for (const a of node.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    const rel = a.getAttribute('rel') || '';
    const cls = a.getAttribute('class') || '';
    if (!href.startsWith('./') || /\bnew\b/.test(cls) || href.includes('redlink=1')) continue;
    if (rel && !rel.includes('mw:WikiLink')) continue;
    let target = decodeURIComponent(href.slice(2)).replace(/_/g, ' ');
    target = target.split('#')[0].split('?')[0];
    if (!target || /^(ファイル|File|画像|Image|Template|Help|Wikipedia|Category|特別|ノート):/i.test(target)) continue;
    out.push({ target, text: squash(a.text) });
  }
  return out;
}

/**
 * ドキュメント内の wikitable を、直前の見出し（h2〜h5）の情報付きで列挙する
 */
export function tablesWithHeadings(root) {
  const out = [];
  const heads = { 2: '', 3: '', 4: '', 5: '' };
  const walk = (node) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName;
      if (/^H[2-5]$/.test(tag)) {
        const lvl = Number(tag[1]);
        heads[lvl] = squash(ch.text);
        for (let l = lvl + 1; l <= 5; l++) heads[l] = '';
        continue;
      }
      if (tag === 'TABLE' && /\bwikitable\b/.test(ch.getAttribute('class') || '')) {
        out.push({
          table: ch,
          path: [heads[2], heads[3], heads[4], heads[5]].filter(Boolean),
          caption: squash(ch.querySelector('caption')?.text || ''),
        });
        continue;
      }
      walk(ch);
    }
  };
  walk(root);
  return out;
}
