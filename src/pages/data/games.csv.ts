/**
 * ソフト全件の一覧（CSV）  /data/games.csv
 * クリア側の台帳と突き合わせるための一覧です。slug がソフトのページのURL（/games/<slug>/）になります。
 * 一覧の情報は Wikipedia 日本語版の各「ゲームタイトル一覧」をもとにしています（CC BY-SA 4.0）。
 */
import type { APIRoute } from 'astro';
import { compareGames, getGamesByPlatform, getPlatforms } from '../../lib/data';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = () => {
  const lines = ['slug,title,platform,platform_name,release_date,publisher,download_only'];
  for (const p of getPlatforms()) {
    for (const g of [...getGamesByPlatform(p.id)].sort(compareGames)) {
      lines.push([g.id, g.title, p.id, p.name, g.date ?? '', (g.publishers ?? []).join('／'), g.digitalOnly ? 1 : 0].map(cell).join(','));
    }
  }
  return new Response('﻿' + lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
