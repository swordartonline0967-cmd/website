/**
 * データ読み込み・集計モジュール
 * data/ フォルダのJSONを読み込み、ページ生成に必要な索引（機種別・年別など）を作ります。
 * ビルド中に一度だけ実行され、結果は使い回されます。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Game, Genre, Maker, Platform } from './types';
import { monthDayKey, normalizeForSearch, yearOf } from './format';

const DATA_DIR = path.join(process.cwd(), 'data');

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')) as T;
}

export interface MakerInfo extends Maker {
  /** 関わったソフトの総数（発売・開発の重複は1本と数える） */
  count: number;
  publishedCount: number;
  developedCount: number;
  /** 機種ID → 本数 */
  platformCounts: Record<string, number>;
  firstYear: number | null;
  lastYear: number | null;
}

export interface YearInfo {
  year: number;
  count: number;
  platformCounts: Record<string, number>;
}

interface DB {
  platforms: Platform[];
  platformById: Map<string, Platform>;
  games: Game[];
  gameById: Map<string, Game>;
  gamesByPlatform: Map<string, Game[]>;
  indexInPlatform: Map<string, number>;
  genres: Genre[];
  genreById: Map<string, Genre>;
  makers: MakerInfo[];
  makerById: Map<string, MakerInfo>;
  makerIdByName: Map<string, string>;
  gamesByMaker: Map<string, Game[]>;
  gamesByGenre: Map<string, Game[]>;
  years: YearInfo[];
  gamesByYear: Map<number, Game[]>;
  gamesByMonthDay: Map<string, Game[]>;
  gamesByDate: Map<string, Game[]>;
  gamesByTitleKey: Map<string, Game[]>;
}

/** 並べ替え用キー。年だけ・年月だけの日付はその期間の最後に並べる */
export function dateSortKey(date: string | null | undefined): string {
  if (!date) return '9999-99-99';
  if (date.length === 4) return `${date}-99-99`;
  if (date.length === 7) return `${date}-99`;
  return date;
}

const collator = new Intl.Collator('ja');

export function compareGames(a: Game, b: Game): number {
  const da = dateSortKey(a.date);
  const db = dateSortKey(b.date);
  if (da !== db) return da < db ? -1 : 1;
  return collator.compare(a.title, b.title);
}

/** 他機種版を探すためのタイトル照合キー */
export function titleKey(title: string): string {
  return normalizeForSearch(title);
}

function makerHashId(name: string): string {
  let h = 0x811c9dc5;
  for (const ch of name) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `x${h.toString(36)}`;
}

let cache: DB | null = null;

function load(): DB {
  if (cache) return cache;

  const platforms = readJson<Platform[]>('platforms.json').sort((a, b) => a.order - b.order);
  const platformById = new Map(platforms.map((p) => [p.id, p]));

  const genres = readJson<Genre[]>('genres.json').sort((a, b) => a.order - b.order);
  const genreById = new Map(genres.map((g) => [g.id, g]));

  const makerList = fs.existsSync(path.join(DATA_DIR, 'makers.json')) ? readJson<Maker[]>('makers.json') : [];
  const makerIdByName = new Map<string, string>();
  const makerBase = new Map<string, Maker>();
  for (const m of makerList) {
    makerBase.set(m.id, m);
    makerIdByName.set(m.name, m.id);
    for (const a of m.aliases ?? []) if (!makerIdByName.has(a)) makerIdByName.set(a, m.id);
  }

  // ソフトを機種ごとに読み込む
  const games: Game[] = [];
  const gamesByPlatform = new Map<string, Game[]>();
  const gamesDir = path.join(DATA_DIR, 'games');
  for (const p of platforms) {
    const file = path.join(gamesDir, `${p.id}.json`);
    const list: Game[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    for (const g of list) g.platform = p.id;
    list.sort(compareGames);
    gamesByPlatform.set(p.id, list);
    games.push(...list);
  }

  const gameById = new Map<string, Game>();
  for (const g of games) {
    if (gameById.has(g.id)) throw new Error(`ソフトIDが重複しています: ${g.id}（data/games/${g.platform}.json を確認してください）`);
    gameById.set(g.id, g);
  }
  const indexInPlatform = new Map<string, number>();
  for (const list of gamesByPlatform.values()) list.forEach((g, i) => indexInPlatform.set(g.id, i));

  // メーカー
  const makerInfo = new Map<string, MakerInfo>();
  const gamesByMaker = new Map<string, Game[]>();
  const resolveMaker = (name: string): string => {
    let id = makerIdByName.get(name);
    if (!id) {
      id = makerHashId(name);
      makerIdByName.set(name, id);
      makerBase.set(id, { id, name });
    }
    return id;
  };
  for (const g of games) {
    const pubIds = new Set((g.publishers ?? []).map(resolveMaker));
    const devIds = new Set((g.developers ?? []).map(resolveMaker));
    const all = new Set([...pubIds, ...devIds]);
    const y = yearOf(g.date);
    for (const id of all) {
      let info = makerInfo.get(id);
      if (!info) {
        const base = makerBase.get(id)!;
        info = { ...base, count: 0, publishedCount: 0, developedCount: 0, platformCounts: {}, firstYear: null, lastYear: null };
        makerInfo.set(id, info);
        gamesByMaker.set(id, []);
      }
      info.count++;
      if (pubIds.has(id)) info.publishedCount++;
      if (devIds.has(id)) info.developedCount++;
      info.platformCounts[g.platform] = (info.platformCounts[g.platform] ?? 0) + 1;
      if (y != null) {
        info.firstYear = info.firstYear == null ? y : Math.min(info.firstYear, y);
        info.lastYear = info.lastYear == null ? y : Math.max(info.lastYear, y);
      }
      gamesByMaker.get(id)!.push(g);
    }
  }
  for (const list of gamesByMaker.values()) list.sort(compareGames);
  const makers = [...makerInfo.values()].sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));

  // ジャンル
  const gamesByGenre = new Map<string, Game[]>(genres.map((g) => [g.id, []]));
  for (const g of games) for (const gid of g.genres ?? []) gamesByGenre.get(gid)?.push(g);
  for (const list of gamesByGenre.values()) list.sort(compareGames);

  // 年・月日・日付・タイトル
  const gamesByYear = new Map<number, Game[]>();
  const gamesByMonthDay = new Map<string, Game[]>();
  const gamesByDate = new Map<string, Game[]>();
  const gamesByTitleKey = new Map<string, Game[]>();
  for (const g of games) {
    const y = yearOf(g.date);
    if (y != null) {
      if (!gamesByYear.has(y)) gamesByYear.set(y, []);
      gamesByYear.get(y)!.push(g);
    }
    const md = monthDayKey(g.date);
    if (md) {
      if (!gamesByMonthDay.has(md)) gamesByMonthDay.set(md, []);
      gamesByMonthDay.get(md)!.push(g);
    }
    if (g.date && g.date.length === 10) {
      if (!gamesByDate.has(g.date)) gamesByDate.set(g.date, []);
      gamesByDate.get(g.date)!.push(g);
    }
    const tk = titleKey(g.title);
    if (!gamesByTitleKey.has(tk)) gamesByTitleKey.set(tk, []);
    gamesByTitleKey.get(tk)!.push(g);
  }
  for (const list of gamesByYear.values()) list.sort(compareGames);
  for (const list of gamesByMonthDay.values()) list.sort(compareGames);
  const years: YearInfo[] = [...gamesByYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => {
      const platformCounts: Record<string, number> = {};
      for (const g of list) platformCounts[g.platform] = (platformCounts[g.platform] ?? 0) + 1;
      return { year, count: list.length, platformCounts };
    });

  const makerById = new Map(makers.map((m) => [m.id, m]));

  cache = {
    platforms, platformById, games, gameById, gamesByPlatform, indexInPlatform,
    genres, genreById, makers, makerById, makerIdByName, gamesByMaker, gamesByGenre,
    years, gamesByYear, gamesByMonthDay, gamesByDate, gamesByTitleKey,
  };
  return cache;
}

// ---------- 取得用の関数 ----------

export const getPlatforms = () => load().platforms;
export const getPlatform = (id: string) => load().platformById.get(id);
export const getGames = () => load().games;
export const getGame = (id: string) => load().gameById.get(id);
export const getGamesByPlatform = (pid: string) => load().gamesByPlatform.get(pid) ?? [];
export const getGenres = () => load().genres;
export const getGenre = (id: string) => load().genreById.get(id);
export const getGamesByGenre = (id: string) => load().gamesByGenre.get(id) ?? [];
export const getMakers = () => load().makers;
export const getMaker = (id: string) => load().makerById.get(id);
export const getGamesByMaker = (id: string) => load().gamesByMaker.get(id) ?? [];
export const getYears = () => load().years;
export const getGamesByYear = (year: number) => load().gamesByYear.get(year) ?? [];
export const getGamesByMonthDay = (mmdd: string) => load().gamesByMonthDay.get(mmdd) ?? [];

/** メーカー名 → メーカー情報（リンク用） */
export function makerByName(name: string): MakerInfo | undefined {
  const db = load();
  const id = db.makerIdByName.get(name);
  return id ? db.makerById.get(id) : undefined;
}

/** 機種ごとの「年 → 本数」 */
export function getPlatformYears(pid: string): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const g of getGamesByPlatform(pid)) {
    const y = yearOf(g.date);
    if (y != null) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count }));
}

export function getGamesByPlatformYear(pid: string, year: number): Game[] {
  return getGamesByPlatform(pid).filter((g) => yearOf(g.date) === year);
}

/** 発売日が未定（空欄）のソフト */
export function getUndatedGames(pid: string): Game[] {
  return getGamesByPlatform(pid).filter((g) => !g.date);
}

/** 同じタイトルの他機種版 */
export function getOtherVersions(game: Game): Game[] {
  const list = load().gamesByTitleKey.get(titleKey(game.title)) ?? [];
  return list.filter((g) => g.id !== game.id).sort(compareGames);
}

/** 同じ日に発売されたソフト（他機種を含む） */
export function getSameDayGames(game: Game, limit = 12): Game[] {
  if (!game.date || game.date.length !== 10) return [];
  const list = load().gamesByDate.get(game.date) ?? [];
  return list.filter((g) => g.id !== game.id).slice(0, limit);
}

/** 同じ機種で前後に発売されたソフト */
export function getNeighbors(game: Game): { prev?: Game; next?: Game } {
  const db = load();
  const list = db.gamesByPlatform.get(game.platform) ?? [];
  const i = db.indexInPlatform.get(game.id) ?? -1;
  return { prev: i > 0 ? list[i - 1] : undefined, next: i >= 0 && i < list.length - 1 ? list[i + 1] : undefined };
}

/** 同じ発売元の、発売日が近いソフト */
export function getSameMakerGames(game: Game, limit = 10): Game[] {
  const name = game.publishers?.[0];
  if (!name) return [];
  const maker = makerByName(name);
  if (!maker) return [];
  const list = getGamesByMaker(maker.id).filter((g) => g.id !== game.id);
  const key = dateSortKey(game.date);
  // 発売日が近い順
  const scored = list.map((g) => ({ g, d: Math.abs(dateDistance(dateSortKey(g.date), key)) }));
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map((s) => s.g).sort(compareGames);
}

function dateDistance(a: string, b: string): number {
  const toNum = (s: string) => {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    return y * 372 + (m > 12 ? 12 : m) * 31 + (d > 31 ? 31 : d);
  };
  return toNum(a) - toNum(b);
}

/** データ全体の統計 */
export function getStats() {
  const db = load();
  const dated = db.games.filter((g) => g.date);
  return {
    games: db.games.length,
    platforms: db.platforms.length,
    makers: db.makers.length,
    firstYear: db.years[0]?.year ?? null,
    lastYear: db.years.at(-1)?.year ?? null,
    dated: dated.length,
  };
}
