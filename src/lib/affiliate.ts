/**
 * ショップへのリンク（アフィリエイトリンク）を作る処理。
 * IDの設定は src/config/affiliate.ts で行います。
 */
import { affiliate } from '../config/affiliate';

export type ShopId = 'amazon' | 'rakuten' | 'yahoo' | 'surugaya';

export interface ShopLink {
  id: ShopId;
  label: string;
  url: string;
  /** アフィリエイトリンクなら true（広告表記・rel="sponsored" を付ける） */
  isAffiliate: boolean;
  /** もしもアフィリエイト経由のリンクなら true（もしも公式のリンク形式に合わせた属性を付ける） */
  viaMoshimo?: boolean;
  /** もしもアフィリエイトの表示回数計測用の画像URL */
  impressionUrl?: string;
}

const enc = encodeURIComponent;
const filled = (s: string) => typeof s === 'string' && s.trim() !== '';

/** もしもアフィリエイト経由のリンク（公式の「どこでもリンク」と同じ形式） */
function moshimo(id: ShopId, label: string, aid: string, p: { p: number; pc: number; pl: number }, url: string): ShopLink {
  const q = `a_id=${enc(aid)}&p_id=${p.p}&pc_id=${p.pc}&pl_id=${p.pl}`;
  return {
    id,
    label,
    url: `https://af.moshimo.com/af/c/click?${q}&url=${enc(url)}`,
    isAffiliate: true,
    viaMoshimo: true,
    impressionUrl: `https://i.moshimo.com/af/i/impression?${q}`,
  };
}
const MOSHIMO = {
  amazon: { p: 170, pc: 185, pl: 4062 },
  rakuten: { p: 54, pc: 54, pl: 616 },
  yahoo: { p: 1225, pc: 1925, pl: 18502 },
};

function amazon(keyword: string): ShopLink {
  const base = `https://www.amazon.co.jp/s?k=${enc(keyword)}`;
  const { trackingId } = affiliate.amazon;
  if (filled(trackingId)) return { id: 'amazon', label: 'Amazon', url: `${base}&tag=${enc(trackingId.trim())}`, isAffiliate: true };
  if (filled(affiliate.moshimo.amazonAid)) return moshimo('amazon', 'Amazon', affiliate.moshimo.amazonAid.trim(), MOSHIMO.amazon, base);
  return { id: 'amazon', label: 'Amazon', url: base, isAffiliate: false };
}

function rakuten(keyword: string): ShopLink {
  const base = `https://search.rakuten.co.jp/search/mall/${enc(keyword)}/`;
  const { affiliateId } = affiliate.rakuten;
  if (filled(affiliateId)) {
    return { id: 'rakuten', label: '楽天市場', url: `https://hb.afl.rakuten.co.jp/hgc/${affiliateId.trim()}/?pc=${enc(base)}&m=${enc(base)}`, isAffiliate: true };
  }
  if (filled(affiliate.moshimo.rakutenAid)) return moshimo('rakuten', '楽天市場', affiliate.moshimo.rakutenAid.trim(), MOSHIMO.rakuten, base);
  return { id: 'rakuten', label: '楽天市場', url: base, isAffiliate: false };
}

function yahoo(keyword: string): ShopLink {
  const base = `https://shopping.yahoo.co.jp/search?p=${enc(keyword)}`;
  const { valueCommerceSid: sid, valueCommercePid: pid } = affiliate.yahoo;
  if (filled(sid) && filled(pid)) {
    return { id: 'yahoo', label: 'Yahoo!ショッピング', url: `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${enc(sid.trim())}&pid=${enc(pid.trim())}&vc_url=${enc(base)}`, isAffiliate: true };
  }
  if (filled(affiliate.moshimo.yahooAid)) return moshimo('yahoo', 'Yahoo!ショッピング', affiliate.moshimo.yahooAid.trim(), MOSHIMO.yahoo, base);
  return { id: 'yahoo', label: 'Yahoo!ショッピング', url: base, isAffiliate: false };
}

function surugaya(keyword: string): ShopLink {
  const base = `https://www.suruga-ya.jp/search?category=&search_word=${enc(keyword)}`;
  const { userId } = affiliate.surugaya;
  if (filled(userId)) {
    return { id: 'surugaya', label: '駿河屋', url: `https://affiliate.suruga-ya.jp/modules/af/af_jump.php?user_id=${enc(userId.trim())}&goods_url=${enc(base)}`, isAffiliate: true };
  }
  return { id: 'surugaya', label: '駿河屋', url: base, isAffiliate: false };
}

/** キーワードで各ショップの検索結果へのリンクを作る */
export function shopLinks(keyword: string, opts: { retro?: boolean } = {}): ShopLink[] {
  const links = [amazon(keyword), rakuten(keyword), yahoo(keyword), surugaya(keyword)];
  // レトロゲームは中古専門の駿河屋を先頭に
  if (opts.retro) links.sort((a, b) => (a.id === 'surugaya' ? -1 : b.id === 'surugaya' ? 1 : 0));
  return links;
}

/** アフィリエイトIDが1つでも設定されているか（広告表記を出すかどうかの判定） */
export const affiliateEnabled: boolean =
  filled(affiliate.amazon.trackingId) ||
  filled(affiliate.rakuten.affiliateId) ||
  (filled(affiliate.yahoo.valueCommerceSid) && filled(affiliate.yahoo.valueCommercePid)) ||
  filled(affiliate.surugaya.userId) ||
  filled(affiliate.moshimo.amazonAid) ||
  filled(affiliate.moshimo.rakutenAid) ||
  filled(affiliate.moshimo.yahooAid);

/** Amazonアソシエイト（直接契約）を使っているか（規約で定められた文言の表示に使う） */
export const amazonAssociateEnabled: boolean = filled(affiliate.amazon.trackingId);
