/**
 * クリア記録の画像  /clears/<ソフトID>/<ファイル名>
 * data/clears/<ソフトID>/shots/ の画像を、そのままの形で公開用に書き出します。
 */
import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getAllClears } from '../../../lib/clears';

export function getStaticPaths() {
  return getAllClears().flatMap((c) =>
    c.images.map((img) => ({ params: { slug: c.slug, file: img.file }, props: { src: path.join(c.dir, 'shots', img.file) } })),
  );
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const GET: APIRoute = ({ props }) => {
  const src = props.src as string;
  return new Response(fs.readFileSync(src), { headers: { 'Content-Type': TYPES[src.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' } });
};
