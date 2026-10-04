/**
 * 発売日順クリア企画：記録（スプレッドシートの行）とソフトのデータを結び付ける共通処理
 */
import { readFileSync } from 'node:fs';
import { normalizeForSearch } from '../../src/lib/format.ts';

/** data フォルダのハードとソフトを読み込む */
export function loadCatalog() {
  const platforms = JSON.parse(readFileSync('data/platforms.json', 'utf8'));
  const games = new Map();
  const byPlatform = new Map();
  for (const p of platforms) {
    let list = [];
    try {
      list = JSON.parse(readFileSync(`data/games/${p.id}.json`, 'utf8'));
    } catch {
      // ソフトのない機種
    }
    byPlatform.set(p.id, list);
    for (const g of list) {
      g.platform = p.id;
      games.set(g.id, g);
    }
  }
  return { platforms, games, byPlatform };
}

// ---- 機種名の読み替え ---------------------------------------------------------

/** 機種名の比較用：全角半角・大文字小文字・記号の違いをなくす */
const platformKey = (s) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** スプレッドシートや動画タイトルでよく使われる機種の書き方 */
const EXTRA_ALIASES = {
  fc: ['FC/NES', 'NES', 'Famicom', 'ファミコン'],
  fds: ['FCD', 'ディスクシステム'],
  sfc: ['SFC/SNES', 'SNES', 'スーファミ', 'Super Famicom'],
  vb: ['Virtual Boy'],
  n64: ['64', 'ロクヨン', 'Nintendo 64'],
  gc: ['NGC', 'GCN', 'GameCube', 'ゲームキューブ'],
  switch: ['NS', 'NSW', 'スイッチ', 'Nintendo Switch'],
  switch2: ['NS2', 'スイッチ2', 'Nintendo Switch 2'],
  gb: ['DMG', 'Game Boy'],
  gbc: ['GBカラー', 'Game Boy Color'],
  gba: ['Game Boy Advance'],
  ds: ['NDS'],
  '3ds': ['N3DS'],
  ps: ['PS1', 'PSX', 'PS one', 'プレステ', 'プレイステーション'],
  ps2: ['プレステ2', 'プレイステーション2'],
  ps3: ['プレステ3', 'プレイステーション3'],
  ps4: ['プレステ4', 'プレイステーション4'],
  ps5: ['プレステ5', 'プレイステーション5'],
  vita: ['PSV', 'PS Vita', 'PlayStation Vita'],
  sg1000: ['SG1000'],
  mk3: ['Mark III', 'マークIII', 'Master System', 'SMS'],
  md: ['Genesis', 'MD/Genesis', 'Mega Drive'],
  mcd: ['Mega-CD', 'Sega CD'],
  '32x': ['Super 32X'],
  ss: ['Saturn', 'サターン'],
  dc: ['Dreamcast', 'ドリキャス'],
  gg: ['Game Gear'],
  pce: ['PCE/TG16', 'TG16', 'PC Engine', 'TurboGrafx-16'],
  neogeo: ['NG', 'AES', 'Neo Geo'],
  ngp: ['NGPC', 'Neo Geo Pocket'],
  ws: ['WSC', 'WonderSwan'],
  xbox: ['XB'],
  x360: ['Xbox 360'],
  xone: ['XB1', 'Xbox One'],
  xsx: ['XSS', 'Xbox Series', 'Xbox Series X', 'Xbox Series S'],
};

/** 機種名 → 機種ID を引く関数を作る */
export function createPlatformResolver(platforms) {
  const map = new Map();
  const add = (alias, id) => {
    const k = platformKey(String(alias));
    if (k && !map.has(k)) map.set(k, id);
  };
  for (const p of platforms) for (const a of [p.id, p.abbr, p.shortName, p.name]) if (a) add(a, p.id);
  for (const [id, list] of Object.entries(EXTRA_ALIASES)) for (const a of list) add(a, id);
  return (name) => (name ? map.get(platformKey(name)) ?? null : null);
}

// ---- タイトルの照合 -----------------------------------------------------------

const norm = (s) => normalizeForSearch(String(s ?? ''));

function bigrams(s) {
  const out = new Map();
  if (s.length === 1) out.set(s, 1);
  for (let i = 0; i < s.length - 1; i++) {
    const b = s.slice(i, i + 2);
    out.set(b, (out.get(b) ?? 0) + 1);
  }
  return out;
}

/** 2つの（正規化済み）タイトルの近さ 0〜1 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [k, n] of A) inter += Math.min(n, B.get(k) ?? 0);
  const dice = (2 * inter) / (a.length - 1 + (b.length - 1) || 1);
  // 片方がもう片方を含む場合は高めに評価する。
  // a（探している名前）がソフト名に含まれる＝副題を省いた書き方なので高め、
  // ソフト名が a に含まれる＝「XI」などの続編の番号が落ちている可能性があるので低め
  let contain = 0;
  if (a.length >= 2 && b.includes(a)) contain = 0.7 + 0.3 * (a.length / b.length);
  else if (b.length >= 2 && a.includes(b)) contain = 0.5 + 0.3 * (b.length / a.length);
  return Math.min(1, Math.max(dice, contain));
}

/** 続編の番号（数字・ローマ数字）を取り出す。「ドラゴンクエストXI」→ ['xi'] */
const sequelTokens = (n) => n.match(/\d+|(?<![a-z])[ivx]{1,4}(?![a-z])/g) ?? [];

/** 続編の番号が合わないときは近さを下げる（「XI」と書いたのに無印、「2015」と書いたのに「2016」など） */
function sequelFactor(query, title) {
  const q = sequelTokens(query);
  const t = sequelTokens(title);
  if (q.some((x) => !t.includes(x))) return 0.75;
  if (t.some((x) => !q.includes(x))) return 0.9;
  return 1;
}

/**
 * タイトル（と英語タイトル）に近いソフトを、近い順に返す
 * @returns {{ game: object, score: number }[]}
 */
export function rankCandidates(title, altTitle, candidates) {
  const t = norm(title);
  const a = altTitle ? norm(altTitle) : '';
  const out = [];
  for (const g of candidates) {
    const nt = norm(g.title);
    let score = similarity(t, nt) * (t === nt ? 1 : sequelFactor(t, nt));
    // 英語タイトル（「日本語 / English」の右側）は、ソフトの海外タイトルとも、英字のタイトルとも比べる
    if (a) {
      for (const alt of [g.title, ...(g.altTitles ?? [])]) {
        const na = norm(alt);
        score = Math.max(score, similarity(a, na) * 0.95 * (a === na ? 1 : sequelFactor(a, na)));
      }
    }
    if (score > 0) out.push({ game: g, score });
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * いちばん近いソフトを決める
 * @returns {{ game?: object, kind: 'exact'|'guess'|'ambiguous'|'notfound', candidates: object[] }}
 */
export function pickGame(title, altTitle, candidates) {
  const ranked = rankCandidates(title, altTitle, candidates);
  const top = ranked.slice(0, 3);
  const exact = ranked.filter((r) => r.score === 1);
  if (exact.length === 1) return { game: exact[0].game, kind: 'exact', candidates: top };
  if (exact.length > 1) return { game: exact[0].game, kind: 'ambiguous', candidates: exact.slice(0, 5) };
  const [best, second] = ranked;
  if (best && best.score >= 0.65 && (!second || best.score - second.score >= 0.08)) return { game: best.game, kind: 'guess', candidates: top };
  return { kind: 'notfound', candidates: top };
}

// ---- 動画URL ------------------------------------------------------------------

/** セルの文字からURLを取り出す（YouTube は動画IDにする） */
export function extractVideos(cell) {
  const out = [];
  for (const raw of String(cell ?? '').match(/https?:\/\/[^\s,、]+/g) ?? []) {
    const m =
      /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/.exec(raw);
    out.push(m ? { yt: m[1] } : { url: raw });
  }
  return out;
}

// ---- CSV ----------------------------------------------------------------------

/** CSV（引用符・セル内改行に対応）を2次元配列にする */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** CSVの1セルを書き出す */
export const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
