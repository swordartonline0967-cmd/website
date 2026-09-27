/** メーカー検索用のデータ  /data/makers.json  [[ID, 名前, ソフト数], ...] */
import type { APIRoute } from 'astro';
import { getMakers } from '../../lib/data';

export const GET: APIRoute = () => {
  const list = getMakers().map((m) => [m.id, m.name, m.count]);
  return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
