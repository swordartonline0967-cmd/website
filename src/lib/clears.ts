/**
 * クリア記録（data/clears/<ソフトID>/site.json と shots/）を読み込み、ページ表示用に整えます。
 * クリア側が1本ごとに出力したフォルダを data/clears/ に置いて保存（push）すると、そのソフトのページに表示されます。
 * フォルダの決まりは data/clears/README.md を見てください。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Marked } from 'marked';
import { getGame } from './data';
import { url } from './url';

export interface ClearChapter {
  seconds: number;
  time: string;
  title: string;
}

export interface ClearImage {
  file: string;
  bytes?: number;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ClearRecordData {
  criterion?: string;
  result?: string;
  cleared_on?: string;
  play_time?: string;
  play_seconds?: number;
  video_time?: string;
  video_seconds?: number;
  deaths?: number;
  losses?: unknown[];
  fast_forward?: unknown[];
}

export interface Clear {
  /** ソフトID（＝フォルダ名。URLの /games/<ソフトID>/） */
  slug: string;
  /** クリア側の台帳のキー */
  key?: string;
  record: ClearRecordData;
  video?: { youtube_id: string; title?: string };
  chapters: ClearChapter[];
  images: ClearImage[];
  /** 記事の見出し（目次用） */
  toc: { id: string; text: string }[];
  /** 表示用に変換した記事のHTML */
  guideHtml: string;
  /** 画像フォルダの場所（ビルド時に画像を書き出すため） */
  dir: string;
}

const ROOT = path.resolve(process.cwd(), process.env.CLEARS_DIR ?? 'data/clears');
const SAFE_FILE = /^[\w.-]+\.(png|jpe?g|gif|webp)$/i;
const YOUTUBE_ID = /^[\w-]{11}$/;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const same = (a: string, b: string) => a.normalize('NFKC').replace(/\s+/g, ' ').trim() === b.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** 画像のURL（/clears/<ソフトID>/<ファイル名>） */
export const clearImageUrl = (slug: string, file: string) => url(`/clears/${slug}/${file}`);

/** 記事（Markdown）をHTMLにする。見出しは1段下げ、チャートの見出しには動画の頭出しボタンを付ける */
function renderGuide(slug: string, md: string, chapters: ClearChapter[], images: ClearImage[]) {
  const toc: { id: string; text: string }[] = [];
  const imageByName = new Map(images.map((i) => [i.file.split('/').pop()!, i]));
  let section = '';
  let n = 0;
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(t) {
        const text = this.parser.parseInline(t.tokens);
        const plain = t.text;
        if (t.depth === 2) {
          section = plain.trim();
          const id = `g${++n}`;
          toc.push({ id, text: plain.trim() });
          return `<h3 id="${id}">${text}</h3>\n`;
        }
        const ch = t.depth === 3 && section === 'チャート' ? chapters.find((c) => same(c.title, plain)) : undefined;
        const tag = `h${Math.min(t.depth + 1, 6)}`;
        if (ch) return `<${tag} class="chart-step">${text} <button type="button" class="seek" data-seek="${ch.seconds}">▶ ${esc(ch.time)}</button></${tag}>\n`;
        return `<${tag}>${text}</${tag}>\n`;
      },
      image(t) {
        const img = imageByName.get(String(t.href).split('/').pop()!.split('?')[0]);
        if (!img) return esc(t.text);
        const w = img.width ?? 0;
        const h = img.height ?? 0;
        // ドット絵（幅400px以下）は2倍に拡大して、くっきり表示する
        const scale = w && w <= 400 ? 2 : 1;
        const size = w && h ? ` width="${w * scale}" height="${h * scale}"` : '';
        return `<img src="${clearImageUrl(slug, img.file)}" alt="${esc(img.alt || t.text)}"${size}${scale > 1 ? ' class="px"' : ''} loading="lazy" decoding="async">`;
      },
      link(t) {
        const href = String(t.href);
        const text = this.parser.parseInline(t.tokens);
        if (!/^https?:\/\//.test(href)) return text;
        return `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;
      },
      // 記事に書かれたHTMLは、そのまま文字として表示する（安全のため）
      html(t) {
        return esc(t.text);
      },
    },
  });
  return { html: marked.parse(md, { async: false }) as string, toc };
}

let cache: Map<string, Clear> | null = null;

function load(): Map<string, Clear> {
  if (cache) return cache;
  cache = new Map();
  if (!fs.existsSync(ROOT)) return cache;
  for (const slug of fs.readdirSync(ROOT).sort()) {
    const dir = path.join(ROOT, slug);
    const file = path.join(dir, 'site.json');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(file)) continue;
    const warn = (msg: string) => console.warn(`[クリア記録] ${slug}: ${msg}`);
    if (!getGame(slug)) {
      warn('このソフトIDはサイトにありません。フォルダ名を確認してください（表示しません）');
      continue;
    }
    let s: Record<string, any>;
    try {
      s = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      warn(`site.json を読み込めません（${(e as Error).message}）。表示しません`);
      continue;
    }
    const chapters: ClearChapter[] = (Array.isArray(s.chapters) ? s.chapters : [])
      .filter((c: any) => c && Number.isFinite(Number(c.seconds)) && c.title)
      .map((c: any) => ({ seconds: Math.max(0, Math.floor(Number(c.seconds))), time: String(c.time ?? ''), title: String(c.title) }));
    const images: ClearImage[] = (Array.isArray(s.images) ? s.images : [])
      .map((i: any) => ({ ...i, file: String(i?.file ?? '').split('/').pop() ?? '' }))
      .filter((i: ClearImage) => SAFE_FILE.test(i.file) && fs.existsSync(path.join(dir, 'shots', i.file)));
    const yt = s.video?.youtube_id && YOUTUBE_ID.test(s.video.youtube_id) ? { youtube_id: s.video.youtube_id, title: s.video.title } : undefined;
    if (s.video?.youtube_id && !yt) warn(`動画ID「${s.video.youtube_id}」が正しくありません`);
    const { html, toc } = renderGuide(slug, typeof s.guide_md === 'string' ? s.guide_md : '', chapters, images);
    cache.set(slug, { slug, key: s.key, record: s.record ?? {}, video: yt, chapters, images, toc, guideHtml: html, dir });
  }
  return cache;
}

export const getClear = (slug: string) => load().get(slug);
export const getAllClears = () => [...load().values()];
