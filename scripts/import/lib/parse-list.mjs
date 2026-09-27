/**
 * Wikipedia「◯◯のゲームタイトル一覧」ページの表を解析して、ソフトの行データを取り出す
 */
import { parse } from 'node-html-parser';
import { cellLines, cellText, tableToGrid, tablesWithHeadings } from './table.mjs';
import { cleanMaker, cleanTitle, monthIn, parseJaDate, yearIn, yearsInTitle } from './normalize.mjs';

/** この見出しの下にある表は取り込まない（発売中止・未発売・非売品・集計表など） */
const SKIP_SECTION = /発売されなかった|非ライセンス|非公認|同人|海賊版|発売中止|開発中止|未発売|中止|非売品|キャンセル|年別|ランキング|流通量|販売本数|売上|関連項目|脚注|参考文献|ダウンロードTOP|周辺機器|アクセサリ|同梱版|本体/;
/** 表のキャプションがこれに当てはまる場合も除外 */
const SKIP_CAPTION = /ランキング|トップ|TOP|販売本数|発売年一覧|地域ごと|年ごと|タイトル数|売上/;

function columnHeaders(headerRows) {
  const width = Math.max(...headerRows.map((r) => r.cells.length));
  const cols = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    for (const r of headerRows) {
      const t = cellText(r.cells[c]);
      if (t && parts.at(-1) !== t) parts.push(t);
    }
    cols.push(parts.join(' '));
  }
  return cols;
}

function detectColumns(headers) {
  const find = (re, exclude) => headers.findIndex((h) => re.test(h) && !(exclude && exclude.test(h)));
  let date = headers.findIndex((h) => /(発売|配信|販売)/.test(h) && /日本/.test(h));
  if (date < 0) date = find(/発売日|配信日|配信開始日|発売年月日|発売時期|販売時期|発売年|リリース日/);
  const multiRegion = headers.some((h) => /北米|欧州|PAL|海外/.test(h));
  return {
    date,
    multiRegion,
    title: find(/タイトル|作品名|ソフト名|ゲーム名|ソフトウェア名/),
    publisher: find(/発売元|販売元|販売|発売メーカー|パブリッシャー|公開元/, /発売日|販売時期|発売年|併売/),
    developer: find(/開発元|開発/),
    genre: find(/ジャンル/),
    note: find(/備考|経緯/),
    cero: find(/CERO|レーティング|年齢/),
    package: find(/^パ$|^パ |パッケージ/),
    format: find(/規格|対応機種|種類|媒体|形態|メディア/),
    price: find(/価格|定価/),
  };
}

/**
 * 一覧ページのHTMLを解析する。
 * @param {string} html  Parsoid形式のHTML
 * @param {string} pageTitle  ページ名（年の推定に使う）
 * @returns {{rows: object[], stats: object}}
 */
export function parseListPage(html, pageTitle) {
  const root = parse(html);
  const pageYears = yearsInTitle(pageTitle);
  const rows = [];
  const stats = { tables: 0, skippedTables: [], rows: 0, unreleased: 0, invalidDate: 0, tbd: 0 };

  for (const { table, path, caption } of tablesWithHeadings(root)) {
    const section = path.join(' > ');
    if (SKIP_SECTION.test(section) || SKIP_CAPTION.test(caption)) {
      stats.skippedTables.push(section || caption);
      continue;
    }
    const grid = tableToGrid(table);
    let h = 0;
    while (h < grid.length && grid[h].cells.length && grid[h].cells.every((c) => c && c.tagName === 'TH')) h++;
    if (h === 0 || h > 4) continue;
    const headers = columnHeaders(grid.slice(0, h));
    const col = detectColumns(headers);
    if (col.date < 0 || col.title < 0) continue;
    stats.tables++;

    const digitalSection = /ダウンロード|配信専用|配信タイトル|DL専用/.test(section) || /配信/.test(headers[col.date]);
    // 見出しから年・月の文脈を得る
    let ctxYear = null;
    let ctxMonth = null;
    for (const p of path) {
      ctxYear = yearIn(p) ?? ctxYear;
      ctxMonth = monthIn(p) ?? ctxMonth;
    }
    if (ctxYear == null && pageYears.length === 1) ctxYear = pageYears[0];
    if (ctxYear == null && pageYears.length > 1 && ctxMonth == null) ctxYear = null;

    for (const r of grid.slice(h)) {
      const distinct = new Set(r.cells.filter(Boolean));
      // 表の途中に入る「1984年」などの区切り行
      if (distinct.size === 1) {
        const t = cellText(r.cells[0]);
        ctxYear = yearIn(t) ?? ctxYear;
        continue;
      }
      if (!r.cells.some((c) => c && c.tagName === 'TD')) continue;
      const dateCell = r.cells[col.date];
      const titleCell = r.cells[col.title];
      if (!dateCell || !titleCell || dateCell === titleCell) continue;

      const dateText = cellText(dateCell);
      const pd = parseJaDate(dateText, ctxYear);
      if (pd.status === 'unreleased') { stats.unreleased++; continue; }
      if (pd.status === 'invalid') {
        // 日付欄が空の行は「日本未発売」扱い（複数地域の表）か「未定」扱い（日本だけの表）
        if (!dateText && !col.multiRegion) { /* 未定として取り込む */ }
        else { stats.invalidDate++; continue; }
      }
      if (pd.status === 'tbd') stats.tbd++;

      const titleLines = cellLines(titleCell);
      if (!titleLines.length) continue;
      const first = titleLines[0];
      const title = cleanTitle(first.text);
      if (!title || /^(タイトル|作品名)$/.test(title)) continue;
      const titleLink = pickLink(first.links, title);
      const altTitles = titleLines.slice(1).map((l) => cleanTitle(l.text)).filter((t) => t && t !== title);

      // 発売元：複数地域の表では1行目（＝日本）だけ、日本だけの表では全行を共同発売元とみなす
      let publishers = [];
      let publisherLinks = [];
      if (col.publisher >= 0 && r.cells[col.publisher] !== titleCell) {
        const lines = cellLines(r.cells[col.publisher]);
        const use = col.multiRegion ? lines.slice(0, 1) : lines;
        for (const l of use) {
          for (const part of l.text.split(/[／、]| \/ /)) {
            const name = cleanMaker(part);
            if (name && !publishers.includes(name)) {
              publishers.push(name);
              const link = l.links.find((k) => k.text === part.trim()) || (l.links.length === 1 ? l.links[0] : null);
              publisherLinks.push(link ? link.target : null);
            }
          }
        }
      }
      let developers = [];
      if (col.developer >= 0) {
        developers = cellLines(r.cells[col.developer]).flatMap((l) => l.text.split(/[／、]/)).map(cleanMaker).filter(Boolean);
      }

      const row = {
        title,
        date: pd.date,
        dateRaw: dateText,
        publishers,
        publisherLinks,
        section,
      };
      if (titleLink) row.wiki = titleLink;
      if (altTitles.length) row.altTitles = altTitles;
      if (developers.length) row.developers = [...new Set(developers)];
      if (col.genre >= 0) {
        const g = cellText(r.cells[col.genre]);
        if (g) row.genreText = g;
      }
      if (col.note >= 0 && r.cells[col.note] !== titleCell) {
        const n = cellText(r.cells[col.note]);
        if (n) row.note = n.length > 400 ? `${n.slice(0, 400)}…` : n;
      }
      if (col.cero >= 0) {
        const c = cellText(r.cells[col.cero]).normalize('NFKC');
        const m = /\b(A|B|C|D|Z)\b/.exec(c);
        if (m) row.cero = m[1];
      }
      if (col.format >= 0) {
        const f = cellText(r.cells[col.format]);
        if (f && f.length <= 40) row.format = f;
      }
      if (col.price >= 0) {
        const p = cellText(r.cells[col.price]).normalize('NFKC').replace(/,/g, '');
        const m = /(\d{3,6})\s*円/.exec(p) || /^(\d{3,6})$/.exec(p);
        if (m) row.price = Number(m[1]);
      }
      let digitalOnly = digitalSection;
      if (!digitalOnly && col.package >= 0) {
        const p = cellText(r.cells[col.package]);
        digitalOnly = !p || /^[-–—×✕]$/.test(p);
      }
      if (digitalOnly) row.digitalOnly = true;
      if (pd.status === 'tbd') row.tbd = true;

      rows.push(row);
      stats.rows++;
    }
  }
  return { rows, stats };
}

/** タイトルセルのリンクのうち、ゲームの記事らしいものを選ぶ */
function pickLink(links, title) {
  if (!links.length) return null;
  // リンクの表示テキストがタイトルと一致（または大部分を占める）ものを優先
  const exact = links.find((l) => l.text === title);
  if (exact) return exact.target;
  const long = links.find((l) => l.text.length >= Math.min(4, title.length) && title.includes(l.text));
  return long ? long.target : null;
}
