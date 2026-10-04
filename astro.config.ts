import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/config/site';

// 公開URL: 環境変数 SITE_URL があればそれを、無ければ src/config/site.ts の url を使います
const siteUrl = (process.env.SITE_URL || site.url).replace(/\/+$/, '');
// サブディレクトリで公開する場合（GitHub Pages など）は BASE_PATH=/リポジトリ名 を指定
const base = process.env.BASE_PATH || '/';
const baseDir = base.endsWith('/') ? base : `${base}/`;

export default defineConfig({
  site: siteUrl,
  base,
  trailingSlash: 'always',
  // Astro 7 の既定（JSX方式）だと要素間の空白が消えるため、HTML方式の空白処理にする
  compressHTML: true,
  build: {
    format: 'directory',
    // CSSは1ファイルにまとめてキャッシュを効かせる
    inlineStylesheets: 'never',
  },
  integrations: [
    sitemap({
      // 検索ページと404ページはサイトマップに載せない（/makers/404/ のようなページは載せる）
      filter: (page) => !['search/', '404/'].includes(new URL(page).pathname.replace(baseDir, '')),
    }),
  ],
});
