/**
 * サイト内リンクのURLを作るヘルパー。
 * サブディレクトリ公開（BASE_PATH）にも対応するため、リンクは必ずここを通して作ります。
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** '/platforms/fc/' のようなパスに BASE_PATH を付ける */
export function url(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}

export const gameUrl = (id: string) => url(`/games/${id}/`);
export const platformUrl = (id: string) => url(`/platforms/${id}/`);
export const platformYearUrl = (id: string, year: number) => url(`/platforms/${id}/${year}/`);
export const makerUrl = (id: string) => url(`/makers/${id}/`);
export const genreUrl = (id: string) => url(`/genres/${id}/`);
export const yearUrl = (year: number) => url(`/years/${year}/`);
/** mmdd は '07-15' 形式 */
export const calendarUrl = (mmdd: string) => url(`/calendar/${mmdd}/`);
export const searchUrl = (q?: string) => url(`/search/${q ? `?q=${encodeURIComponent(q)}` : ''}`);
