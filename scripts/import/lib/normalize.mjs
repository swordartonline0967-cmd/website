/**
 * 日付・タイトル・メーカー名などの正規化
 */

const SEASON = /(春|夏|秋|冬|初頭|前半|後半|上旬|中旬|下旬|上半期|下半期|内|中|頃|予定|以降|末)/;

/**
 * 日本語の日付表記を 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' に変換する。
 * 年が書かれていない「7月15日」などは ctxYear を使う。
 * 戻り値: { date: string|null, status: 'ok'|'unreleased'|'tbd'|'invalid', raw }
 */
export function parseJaDate(text, ctxYear = null) {
  const raw = (text || '').trim();
  const t = raw
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '') // 括弧書き（限定版など）を除く
    .replace(/※.*$/, '');
  if (!t || /^[-–—−‐―ー]+$/.test(t) || /^(N\/A|n\/a|なし)$/.test(t)) return { date: null, status: 'unreleased', raw };
  if (/未発売|発売中止|中止|キャンセル|未配信|配信停止のみ/.test(t)) return { date: null, status: 'unreleased', raw };
  if (/^(未定|発売日未定|配信日未定|TBA|TBD|近日|近日配信|近日発売|未発表)/i.test(t)) return { date: null, status: 'tbd', raw };

  let m;
  // 1983年7月15日 / 1983/7/15 / 1983.7.15 / 1983-07-15
  if ((m = /^(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?/.exec(t))) return ok(m[1], m[2], m[3], raw);
  // 1986年6月
  if ((m = /^(\d{4})年(\d{1,2})月/.exec(t))) return ok(m[1], m[2], null, raw);
  // 1986/6
  if ((m = /^(\d{4})[/.](\d{1,2})$/.exec(t))) return ok(m[1], m[2], null, raw);
  // 2026年春 / 2026年予定 / 1987年
  if ((m = /^(\d{4})年/.exec(t))) return ok(m[1], null, null, raw, SEASON.test(t) ? 'tbd' : 'ok');
  if ((m = /^(\d{4})$/.exec(t))) return ok(m[1], null, null, raw);
  // 7月15日（年は文脈から）
  if ((m = /^(\d{1,2})月(\d{1,2})日/.exec(t)) && ctxYear) return ok(ctxYear, m[1], m[2], raw);
  // 7/15
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(t)) && ctxYear) return ok(ctxYear, m[1], m[2], raw);
  // 7月 / 7月予定
  if ((m = /^(\d{1,2})月/.exec(t)) && ctxYear) return ok(ctxYear, m[1], null, raw, SEASON.test(t) ? 'tbd' : 'ok');
  return { date: null, status: 'invalid', raw };
}

function ok(y, mo, d, raw, status = 'ok') {
  const year = Number(y);
  if (year < 1970 || year > 2100) return { date: null, status: 'invalid', raw };
  if (mo == null) return { date: String(year), status, raw };
  const month = Number(mo);
  if (month < 1 || month > 12) return { date: String(year), status, raw };
  const mm = String(month).padStart(2, '0');
  if (d == null) return { date: `${year}-${mm}`, status, raw };
  const day = Number(d);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maxDay) return { date: `${year}-${mm}`, status, raw };
  return { date: `${year}-${mm}-${String(day).padStart(2, '0')}`, status, raw };
}

/** 見出しやページ名から西暦を取り出す（例: '2000年（全122タイトル）' → 2000） */
export function yearIn(text) {
  const m = /(19[6-9]\d|20\d\d)年/.exec(text || '');
  return m ? Number(m[1]) : null;
}

/** 見出しから「◯月」を取り出す（例: '1月' → 1） */
export function monthIn(text) {
  const m = /^(\d{1,2})月$/.exec((text || '').trim());
  return m ? Number(m[1]) : null;
}

/** ページ名の「(2000年-2001年)」から年の範囲を取り出す */
export function yearsInTitle(title) {
  const m = /\((\d{4})年(?:-(\d{4})年)?\)/.exec(title || '');
  if (!m) return [];
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  const out = [];
  for (let y = a; y <= b; y++) out.push(y);
  return out;
}

/** タイトルの整形（脚注記号や余分な空白を除く） */
export function cleanTitle(s) {
  return (s || '')
    .replace(/\[\s*(?:注|注釈|脚注|要出典|note)?\s*\d*\s*\]/gi, '')
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[※*＊]+|[※*＊]+$/g, '')
    .trim();
}

/** メーカー名の整形 */
export function cleanMaker(s) {
  return (s || '')
    .replace(/\[\s*(?:注|注釈|脚注)?\s*\d*\s*\]/g, '')
    .replace(/[（(](?:全世界|世界|日本|国内|北米|欧州|海外|アジア|JP|NA|EU|PAL)[)）]/gi, '')
    .replace(/^(?:発売元|販売元|販売|発売)[:：]/, '')
    // 「サンソフト[サン電子]」のようなブランド名[会社名]の注記を除く
    .replace(/\s*[［\[][^\]］]{1,30}[\]］]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 照合用のタイトルキー（表記ゆれを吸収） */
export function titleKey(s) {
  return (s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･·:：\-‐−–—~〜～!！?？、。,.，．'"“”‘’「」『』【】()（）［］\[\]<>＜＞〈〉《》/／\\&＆+＋#＃☆★♪]/g, '');
}

/** 文字bigramのDice係数（タイトルの類似度 0〜1） */
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}
