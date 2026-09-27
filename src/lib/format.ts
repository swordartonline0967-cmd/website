/**
 * 表示用の整形ヘルパー（日付・価格など）
 */

/** 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' / null を分解する */
export function parseDate(date: string | null | undefined) {
  if (!date) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(date);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: m[2] ? Number(m[2]) : null,
    day: m[3] ? Number(m[3]) : null,
  };
}

/** 発売日を「1983年7月15日」のような日本語表記にする */
export function formatDate(date: string | null | undefined, fallback = '未定'): string {
  const d = parseDate(date);
  if (!d) return fallback;
  if (d.month && d.day) return `${d.year}年${d.month}月${d.day}日`;
  if (d.month) return `${d.year}年${d.month}月`;
  return `${d.year}年`;
}

/** 表組み用の短い日付表記「1983/07/15」 */
export function formatDateShort(date: string | null | undefined, fallback = '未定'): string {
  const d = parseDate(date);
  if (!d) return fallback;
  const mm = d.month ? String(d.month).padStart(2, '0') : '--';
  const dd = d.day ? String(d.day).padStart(2, '0') : '--';
  return `${d.year}/${mm}/${dd}`;
}

/** 月日だけ「7月15日」 */
export function formatMonthDay(date: string | null | undefined): string {
  const d = parseDate(date);
  if (!d || !d.month || !d.day) return '';
  return `${d.month}月${d.day}日`;
}

export function yearOf(date: string | null | undefined): number | null {
  return parseDate(date)?.year ?? null;
}

/** 'MM-DD'（例: '07-15'）。日付が不完全なら null */
export function monthDayKey(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date.slice(5);
}

/** 価格を「14,800円」にする */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return '';
  return `${price.toLocaleString('ja-JP')}円`;
}

/** 数値を3桁区切りに */
export function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 西暦から「◯年代」 */
export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/**
 * 検索・照合用の文字列正規化
 * 全角半角の統一、カタカナ→ひらがな、小文字化、空白・記号の除去
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･·:：\-‐−–—~〜～!！?？、。,.，．'"“”‘’「」『』【】()（）［］\[\]<>＜＞〈〉《》/／\\&＆+＋#＃☆★♪]/g, '');
}
