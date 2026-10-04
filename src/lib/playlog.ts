/**
 * 発売日順クリア企画の記録（data/playlog.json）を読み込み、ページ表示用に集計します。
 * 記録は Google スプレッドシートから scripts/playlog/import-sheet.mjs で取り込みます。
 */
import fs from 'node:fs';
import path from 'node:path';
import { playlog as config } from '../config/playlog';
import type { Game } from './types';
import { dateSortKey, getGame, getGamesByPlatform, getPlatforms } from './data';
import { jstDate } from './format';

export type PlayStatus = 'clear' | 'playing' | 'hold' | 'extra';

export interface PlayVideo {
  /** YouTube の動画ID */
  yt?: string;
  /** YouTube 以外の動画のURL */
  url?: string;
}

export interface PlayRecord {
  id: string;
  /** 企画での通し番号（機種ごと） */
  num?: number;
  status: PlayStatus;
  clearedAt?: string;
  comment?: string;
  videos: PlayVideo[];
}

export interface PlaylogIssue {
  row: number;
  platform: string;
  title: string;
  kind: string;
  message: string;
  id?: string;
  candidates?: { id: string; title: string; date: string | null }[];
}

interface PlaylogFile {
  updatedAt?: string;
  records: PlayRecord[];
  issues: PlaylogIssue[];
  videoTitles: Record<string, string>;
}

export const STATUS_LABEL: Record<PlayStatus, string> = {
  clear: 'クリア',
  playing: '挑戦中',
  hold: '保留',
  extra: '企画外',
};

let cache: { file: PlaylogFile; byId: Map<string, PlayRecord> } | null = null;

function load() {
  if (cache) return cache;
  const p = path.join(process.cwd(), 'data', 'playlog.json');
  const file: PlaylogFile = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { records: [], issues: [], videoTitles: {} };
  // ソフトのデータにない記録（IDの変更など）は表示しない
  file.records = file.records.filter((r) => getGame(r.id));
  cache = { file, byId: new Map(file.records.map((r) => [r.id, r])) };
  return cache;
}

/** 企画の記録が1件でもあれば true（メニューやトップの表示に使う） */
export const playlogEnabled = () => load().file.records.some((r) => r.status !== 'extra');
export const getPlayRecord = (id: string) => load().byId.get(id);
export const getPlaylogIssues = () => load().file.issues;
export const getPlaylogUpdatedAt = () => load().file.updatedAt;
export const videoTitle = (yt: string) => load().file.videoTitles[yt];

/** 企画の対象になるソフトか（ダウンロード専用は、例外の機種を除いて対象外） */
export function isTarget(g: Game): boolean {
  return !g.digitalOnly || config.digitalOnlyPlatforms.includes(g.platform);
}

export interface PlatformProgress {
  platformId: string;
  clear: number;
  playing: number;
  hold: number;
  /** 企画の対象になる、発売済みのソフトの数 */
  targets: number;
  /** いちばん新しい記録（通し番号がいちばん大きいもの。番号がなければ発売日順で最後のもの） */
  latest?: { game: Game; record: PlayRecord };
  /** 新しい順の記録 */
  recent: { game: Game; record: PlayRecord }[];
  /** 挑戦中のソフト */
  current: { game: Game; record: PlayRecord }[];
  /** 次に遊ぶソフト（発売日順で、記録のない対象ソフトのうち最初のもの） */
  next?: Game;
  nextNum?: number;
  /** 企画で遊んだソフト（発売日順） */
  played: { game: Game; record: PlayRecord }[];
}

const progressCache = new Map<string, PlatformProgress | null>();

/** 機種ごとの進み具合。企画の記録がない機種は null */
export function getPlatformProgress(pid: string): PlatformProgress | null {
  if (progressCache.has(pid)) return progressCache.get(pid)!;
  const { byId } = load();
  const list = getGamesByPlatform(pid);
  const today = jstDate();
  const played: { game: Game; record: PlayRecord }[] = [];
  let frontier = -1;
  list.forEach((g, i) => {
    const r = byId.get(g.id);
    if (r && r.status !== 'extra') {
      played.push({ game: g, record: r });
      frontier = i;
    }
  });
  if (!played.length) {
    progressCache.set(pid, null);
    return null;
  }
  const released = (g: Game) => dateSortKey(g.date) <= today && !g.missingFromSource;
  const count = (s: PlayStatus) => played.filter((p) => p.record.status === s).length;
  const nums = played.map((p) => p.record.num).filter((n): n is number => typeof n === 'number');
  // 同じ日に発売されたソフトの順番は遊んだ順と違うことがあるので、通し番号があればそれを優先する
  const recent = played.map((p, i) => ({ p, i })).sort((a, b) => (b.p.record.num ?? -1) - (a.p.record.num ?? -1) || b.i - a.i).map((x) => x.p);
  const progress: PlatformProgress = {
    platformId: pid,
    clear: count('clear'),
    playing: count('playing'),
    hold: count('hold'),
    targets: list.filter((g) => isTarget(g) && released(g)).length,
    latest: recent[0],
    recent,
    current: played.filter((p) => p.record.status === 'playing'),
    next: list.slice(frontier + 1).find((g) => isTarget(g) && released(g) && !byId.has(g.id)),
    nextNum: nums.length ? Math.max(...nums) + 1 : undefined,
    played,
  };
  progressCache.set(pid, progress);
  return progress;
}

/** 企画の記録がある機種の進み具合（ハード一覧の順） */
export function getAllProgress(): PlatformProgress[] {
  return getPlatforms()
    .map((p) => getPlatformProgress(p.id))
    .filter((p): p is PlatformProgress => p !== null);
}

/** 同じ機種で、企画の中で前後に遊んだソフト（発売日順） */
export function getPlayNeighbors(game: Game): { prev?: Game; next?: Game } {
  const prog = getPlatformProgress(game.platform);
  if (!prog) return {};
  const i = prog.played.findIndex((p) => p.game.id === game.id);
  if (i < 0) return {};
  return { prev: prog.played[i - 1]?.game, next: prog.played[i + 1]?.game };
}

/** 最近クリアしたソフト（クリア日が入っている記録のみ、新しい順） */
export function getRecentClears(limit = 10): { game: Game; record: PlayRecord }[] {
  return load()
    .file.records.filter((r) => r.status === 'clear' && r.clearedAt)
    .sort((a, b) => (a.clearedAt! < b.clearedAt! ? 1 : -1))
    .slice(0, limit)
    .map((record) => ({ game: getGame(record.id)!, record }));
}

/** YouTube 動画のURL */
export const youtubeWatchUrl = (yt: string) => `https://www.youtube.com/watch?v=${yt}`;
