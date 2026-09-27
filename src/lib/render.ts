/**
 * 大きな一覧表のHTMLを高速に作るための関数。
 * （何千行もある表をコンポーネントで描くとビルドが遅くなるため、文字列で組み立てます）
 */
import type { Game } from './types';
import { esc } from './html';
import { formatDateShort, yearOf } from './format';
import { getPlatform } from './data';
import { platformClass } from './platform-style';
import { gameUrl, platformUrl } from './url';

export interface RowOptions {
  showPlatform?: boolean;
  showMaker?: boolean;
  /** 指定すると「◯周年」バッジを表示（カレンダーページ用） */
  anniversaryYear?: number;
}

export function renderGameRows(games: Game[], opt: RowOptions = {}): string {
  const { showPlatform = false, showMaker = true, anniversaryYear } = opt;
  let html = '';
  for (const g of games) {
    const date = g.dateNote ? esc(g.dateNote) : formatDateShort(g.date);
    let title = `<a href="${gameUrl(g.id)}">${esc(g.title)}</a>`;
    if (g.digitalOnly) title += '<span class="dl" title="ダウンロード専用">DL</span>';
    if (anniversaryYear) {
      const y = yearOf(g.date);
      if (y && anniversaryYear - y > 0) title += `<span class="an">${anniversaryYear - y}周年</span>`;
    }
    html += `<tr${g.digitalOnly ? ' class="is-dl"' : ''}><td class="d">${date}</td>`;
    if (showPlatform) {
      const p = getPlatform(g.platform);
      html += `<td class="p"><a class="badge ${platformClass(p)}" href="${platformUrl(g.platform)}">${esc(p?.abbr ?? g.platform)}</a></td>`;
    }
    html += `<td class="t">${title}</td>`;
    if (showMaker) html += `<td class="m">${esc((g.publishers ?? []).join('／'))}</td>`;
    html += '</tr>';
  }
  return html;
}
