/**
 * Wikidataのジャンル名（日本語・英語ラベル）を、このサイトのジャンル分類に変換するルール。
 * 上から順に判定し、当てはまったものをすべて付けます（例: アクションRPG → action + rpg）。
 */
const RULES = [
  { genres: ['action', 'adventure'], re: /アクションアドベンチャー|action-adventure|action adventure/i },
  { genres: ['action', 'rpg'], re: /アクションRPG|アクションロールプレイング|action role-playing|hack and slash|ハックアンドスラッシュ|ソウルライク|soulslike/i },
  { genres: ['simulation', 'rpg'], re: /シミュレーションRPG|タクティカル.*RPG|タクティカルロールプレイング|tactical role-playing|ストラテジーRPG|strategy role-playing/i },
  { genres: ['rpg'], re: /ロールプレイング|RPG|role-playing|ローグライク|roguelike|ダンジョンクロール|dungeon crawl|MMORPG|育成RPG/i },
  { genres: ['fighting'], re: /格闘|fighting game|versus fighting|対戦型格闘|プロレス|wrestling|ボクシング|boxing|martial arts/i },
  { genres: ['shooting'], re: /シューティング|シューター|shooter|shoot 'em up|shoot-'em-up|STG|FPS|TPS|ガンシュー|弾幕|bullet hell|light gun|rail shooter/i },
  { genres: ['racing'], re: /レース|レーシング|racing|ドライブ|driving|カート|kart|バイク|motorcycle/i },
  { genres: ['sports'], re: /スポーツ|sports|野球|baseball|サッカー|soccer|association football|ゴルフ|golf|テニス|tennis|バスケットボール|basketball|アメリカンフットボール|american football|アイスホッケー|ice hockey|スケートボード|skateboard|スノーボード|snowboard|釣り|fishing|競馬|horse racing|相撲|sumo|バレーボール|volleyball|ボウリング|bowling|スキー|skiing|サーフィン|surfing|陸上競技|track and field|ビリヤード|billiards|卓球|table tennis|ラグビー|rugby|ダーツ/i },
  { genres: ['puzzle'], re: /パズル|puzzle|落ち物|倉庫番|sokoban|ピクロス|picross|nonogram|数独|sudoku|マッチ3|match-three|tile-matching/i },
  { genres: ['table'], re: /麻雀|mahjong|将棋|shogi|囲碁|\bgo\b|チェス|chess|オセロ|reversi|トランプ|card game|カードゲーム|花札|hanafuda|ボードゲーム|board game|パチンコ|pachinko|パチスロ|pachislot|slot machine|ギャンブル|gambling|casino|カジノ|すごろく|デジタルカードゲーム|collectible card|トレーディングカード|ソリティア|solitaire|バックギャモン|backgammon|競艇|競輪/i },
  { genres: ['music'], re: /音楽|music|リズム|rhythm|音ゲー|ダンス|dance|カラオケ|karaoke/i },
  { genres: ['party'], re: /パーティー|party|ミニゲーム|minigame|クイズ|quiz|trivia|バラエティ|フィットネス|fitness|エクササイズ|exergame/i },
  { genres: ['education'], re: /教育|学習|educational|エデュテインメント|edutainment|トレーニング|brain training|typing|タイピング|ユーティリティ|utility|実用|お絵かき|drawing|プログラミング|programming/i },
  { genres: ['adventure'], re: /アドベンチャー|adventure|ノベル|novel|ビジュアルノベル|visual novel|ポイント・アンド・クリック|point-and-click|推理|detective|mystery|ホラー|horror|サバイバルホラー|survival horror|脱出|escape|インタラクティブ・フィクション|interactive fiction|恋愛シミュレーション|dating sim|walking simulator|ウォーキングシミュレーター/i },
  { genres: ['simulation'], re: /シミュレーション|simulation|simulator|ストラテジー|strategy|戦略|戦術|tactics|ウォーゲーム|wargame|4X|タワーディフェンス|tower defense|経営|management|育成|life simulation|ライフシミュレーション|シティビルダー|city-building|construction|建設|神ゲー|god game|フライトシミュレーター|flight simulator|列車|train|恋愛|サンドボックス|sandbox|クラフト|crafting|農業|farming/i },
  { genres: ['action'], re: /アクション|action|プラットフォーム|platform game|platformer|ベルトスクロール|beat 'em up|ステルス|stealth|メトロイドヴァニア|metroidvania|ランゲーム|endless runner|run and gun|ラン・アンド・ガン|アクションアドベンチャー|action-adventure|無双|musou|サバイバル|survival|ピンボール|pinball|ブロック崩し|breakout|バトルロイヤル|battle royale|MOBA|hero shooter/i },
];

/** ラベル（日本語・英語）からジャンルIDの配列を返す */
export function mapGenreLabels(labels) {
  const out = new Set();
  for (const label of labels.filter(Boolean)) {
    for (const r of RULES) {
      if (r.re.test(label)) {
        for (const g of r.genres) out.add(g);
        break; // 1つのラベルにつき最初に当てはまったルールだけ
      }
    }
  }
  return [...out];
}

/** 一覧表に書かれていたジャンル表記（例: 'RPG', 'アクション'）からも推定する */
export function mapGenreText(text) {
  if (!text) return [];
  return mapGenreLabels(text.split(/[\/／・、,，\s]+/).concat([text]));
}
