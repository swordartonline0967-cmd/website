/**
 * data/ フォルダの読み書き
 */
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.join(process.cwd(), 'data');

export function readJson(rel, fallback) {
  const file = path.join(DATA_DIR, rel);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 配列を「1行に1件」の形で保存（差分が見やすく、手修正もしやすい） */
export function writeJsonLines(rel, array) {
  const file = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = array.map((o) => JSON.stringify(o)).join(',\n');
  fs.writeFileSync(file, `[\n${body}\n]\n`);
}

export function writeJsonPretty(rel, value) {
  const file = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export const readPlatforms = () => readJson('platforms.json', []);
export const readGames = (pid) => readJson(`games/${pid}.json`, []);
export const writeGames = (pid, games) => writeJsonLines(`games/${pid}.json`, games);
export const readMakers = () => readJson('makers.json', []);
export const writeMakers = (makers) => writeJsonLines('makers.json', makers);

/** ソフト1件のキーの並び順をそろえる（ファイルを読みやすくするため） */
const KEY_ORDER = [
  'id', 'title', 'date', 'dateNote', 'publishers', 'developers', 'genres', 'genreText', 'cero', 'price', 'priceText',
  'digitalOnly', 'format', 'note', 'description', 'altTitles', 'overseas', 'wiki', 'wikidata', 'source', 'missingFromSource', 'lock',
];
export function orderKeys(game) {
  const out = {};
  for (const k of KEY_ORDER) if (game[k] !== undefined && game[k] !== null && !(Array.isArray(game[k]) && !game[k].length)) out[k] = game[k];
  for (const k of Object.keys(game)) if (!(k in out) && !KEY_ORDER.includes(k) && game[k] !== undefined) out[k] = game[k];
  return out;
}
