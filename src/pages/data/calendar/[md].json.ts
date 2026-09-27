/**
 * 「今日は何の日」用のデータ  /data/calendar/MM-DD.json
 * トップページがこのファイルを読み込んで、今日発売されたゲームを表示します。
 */
import type { APIRoute } from 'astro';
import { getGamesByMonthDay, getPlatform } from '../../../lib/data';
import { platformClass } from '../../../lib/platform-style';

export function getStaticPaths() {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const days = new Date(Date.UTC(2024, m, 0)).getUTCDate(); // うるう年で2/29を含める
    for (let d = 1; d <= days; d++) out.push({ params: { md: `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` } });
  }
  return out;
}

export const GET: APIRoute = ({ params }) => {
  const games = getGamesByMonthDay(params.md!);
  const platforms: Record<string, [string, string]> = {};
  const list = games.map((g) => {
    const p = getPlatform(g.platform)!;
    platforms[g.platform] = [p.abbr, platformClass(p)];
    return [g.id, g.title, g.platform, Number(g.date!.slice(0, 4))];
  });
  return new Response(JSON.stringify({ platforms, games: list }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
