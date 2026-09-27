/**
 * 検索用データ  /search-index.json
 * 容量を抑えるため、機種・メーカーは番号で参照する形にしています。
 *   p: [[機種ID, 略称, CSSクラス, 通称], ...]
 *   m: [メーカー名, ...]
 *   g: [[機種番号, ソフト番号, タイトル, 発売年(不明は0), メーカー番号(-1=なし), 海外タイトル?], ...]
 */
import type { APIRoute } from 'astro';
import { getGames, getPlatforms } from '../lib/data';
import { platformClass } from '../lib/platform-style';
import { yearOf } from '../lib/format';

export const GET: APIRoute = () => {
  const platforms = getPlatforms();
  const pIndex = new Map(platforms.map((p, i) => [p.id, i]));
  const makers: string[] = [];
  const mIndex = new Map<string, number>();
  const games = getGames().map((g) => {
    const pub = g.publishers?.[0];
    let mi = -1;
    if (pub) {
      if (!mIndex.has(pub)) { mIndex.set(pub, makers.length); makers.push(pub); }
      mi = mIndex.get(pub)!;
    }
    const num = Number(g.id.slice(g.platform.length + 1));
    const row: (string | number)[] = [pIndex.get(g.platform)!, num, g.title, yearOf(g.date) ?? 0, mi];
    if (g.altTitles?.length) row.push(g.altTitles[0]);
    return row;
  });
  const body = {
    p: platforms.map((p) => [p.id, p.abbr, platformClass(p), p.shortName]),
    m: makers,
    g: games,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
