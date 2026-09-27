/** ハード（ゲーム機）の種類 */
export type PlatformType = 'home' | 'handheld' | 'hybrid' | 'addon';

/** data/platforms.json の1件分 */
export interface Platform {
  /** URLに使うID（英小文字・数字） 例: 'fc' */
  id: string;
  /** 正式名称 例: 'ファミリーコンピュータ' */
  name: string;
  /** 通称 例: 'ファミコン' */
  shortName: string;
  /** 略称 例: 'FC' */
  abbr: string;
  /** 発売元 例: '任天堂' */
  maker: string;
  /** ハード一覧でのグループ分け用（メーカー系列） */
  makerGroup: string;
  type: PlatformType;
  /** ゲーム機の世代（第◯世代） */
  generation: number;
  /** 日本での発売日 'YYYY-MM-DD' */
  releaseDate: string;
  /** 発売時の価格（円）。不明なら省略 */
  price?: number;
  /** 価格の補足（税別・税込・モデル違いなど） */
  priceNote?: string;
  /** ソフトの媒体 例: 'ロムカセット' */
  media?: string;
  /** ハードの説明文 */
  description: string;
  /** Wikipedia日本語版の記事名 */
  wikipedia?: string;
  /** バッジ等に使うテーマカラー */
  color: string;
  /** 一覧で並べる順番（小さいほど先） */
  order: number;
  /** WikidataのID（ジャンル等の補完に使う） */
  wikidata?: string[];
  /** ソフト一覧の取り込み元（Wikipediaのページ名） */
  sources?: string[];
}

/** data/games/*.json の1件分（＝ある機種で発売された1本のソフト） */
export interface Game {
  /** URLに使うID 例: 'fc-1'（一度決めたら変えない） */
  id: string;
  /** 機種ID 例: 'fc' */
  platform: string;
  /** タイトル */
  title: string;
  /** 日本での発売日 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY'（不明・未定は null） */
  date: string | null;
  /** 発売時期の表記（「2026年春」など、日付が確定していない場合） */
  dateNote?: string;
  /** 発売元（複数可） */
  publishers: string[];
  /** 開発元（分かる場合） */
  developers?: string[];
  /** ジャンルID（data/genres.json の id） */
  genres?: string[];
  /** 一覧に記載されていたジャンル表記そのまま */
  genreText?: string;
  /** CEROレーティング（A/B/C/D/Z） */
  cero?: string;
  /** 規格・種類（HuCARD / CD-ROM² など） */
  format?: string;
  /** 発売時の価格（円） */
  price?: number;
  /** 価格の補足（税込・税別・オープン価格など） */
  priceText?: string;
  /** 備考 */
  note?: string;
  /** 紹介文（手入力用） */
  description?: string;
  /** 海外でのタイトル */
  altTitles?: string[];
  /** Wikipedia日本語版の記事名（個別記事がある場合） */
  wiki?: string;
  /** WikidataのID（Q...） */
  wikidata?: string;
  /** 海外での発売日 */
  overseas?: { na?: string; eu?: string };
  /** ダウンロード専用ソフトなら true */
  digitalOnly?: boolean;
  /** データの取り込み元（Wikipediaのページ名、手入力なら 'manual'） */
  source?: string;
  /** true にすると、データ取り込みスクリプトがこの行を上書きしません（手修正の保護） */
  lock?: boolean;
  /** 取り込み元の一覧から消えたソフト（要確認） */
  missingFromSource?: boolean;
}

/** data/makers.json の1件分 */
export interface Maker {
  id: string;
  name: string;
  /** 同じ会社の別表記 */
  aliases?: string[];
  /** Wikipedia日本語版の記事名 */
  wiki?: string;
}

/** data/genres.json の1件分 */
export interface Genre {
  id: string;
  name: string;
  description: string;
  order: number;
}
