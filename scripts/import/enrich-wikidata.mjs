/**
 * Wikidata（CC0）から、ソフトの「ジャンル」「開発元」「WikidataのID」を補います。
 *
 *  1) Wikipediaの記事リンクがあるソフト … 記事 → Wikidata項目 で確実に対応づけ
 *  2) 記事リンクがないソフト … 機種ごとのWikidata上のソフト一覧と、タイトルが完全一致したものだけ対応づけ
 *
 * 使い方: npm run data:wikidata  （機種を絞る場合: npm run data:wikidata -- switch ps5）
 */
import { ensureProxySupport } from './lib/http.mjs';
ensureProxySupport();

const { sparql, lit, qid } = await import('./lib/wikidata.mjs');
const { mapGenreLabels } = await import('./lib/genre-map.mjs');
const { titleKey } = await import('./lib/normalize.mjs');
const { normalizeMakerName, updateMakers } = await import('./lib/makers.mjs');
const { orderKeys, readGames, readPlatforms, writeGames } = await import('./lib/store.mjs');

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const platforms = readPlatforms();
const targets = platforms.filter((p) => !only.length || only.includes(p.id));
const gamesByPlatform = new Map(targets.map((p) => [p.id, readGames(p.id)]));

const items = new Map(); // QID → { isGame, isSeries, platforms:Set, genres:Set, devs:Set }
const itemOf = (q) => {
  if (!items.has(q)) items.set(q, { isGame: false, isSeries: false, platforms: new Set(), genres: new Set(), devs: new Set() });
  return items.get(q);
};

// ---------- 1) 記事名 → Wikidata項目 ----------
const articleToItem = new Map();
const articles = [...new Set([...gamesByPlatform.values()].flat().map((g) => g.wiki).filter(Boolean))];
console.log(`記事リンク: ${articles.length}件をWikidataで照会します`);
const BATCH = 150;
for (let i = 0; i < articles.length; i += BATCH) {
  const batch = articles.slice(i, i + BATCH);
  const q = `SELECT ?name ?item ?isGame ?isSeries ?platform ?genre ?dev WHERE {
    VALUES ?name { ${batch.map((n) => `${lit(n)}@ja`).join(' ')} }
    ?article schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?name .
    BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q7889 } AS ?isGame)
    BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q7058673 } AS ?isSeries)
    OPTIONAL { ?item wdt:P400 ?platform }
    OPTIONAL { ?item wdt:P136 ?genre }
    OPTIONAL { ?item wdt:P178 ?dev }
  }`;
  const rows = await sparql(q, `記事 ${i + 1}〜${i + batch.length}`);
  for (const r of rows) {
    const q2 = qid(r.item.value);
    articleToItem.set(r.name.value, q2);
    const it = itemOf(q2);
    it.isGame ||= r.isGame?.value === 'true';
    it.isSeries ||= r.isSeries?.value === 'true';
    if (r.platform) it.platforms.add(qid(r.platform.value));
    if (r.genre) it.genres.add(qid(r.genre.value));
    if (r.dev) it.devs.add(qid(r.dev.value));
  }
  process.stdout.write(`\r  ${Math.min(i + BATCH, articles.length)}/${articles.length}`);
}
console.log('');

// ---------- 2) 機種ごとのWikidata上のソフト一覧（タイトル一致用） ----------
const labelIndex = new Map(); // pid → Map(titleKey → Set(QID))
for (const p of targets) {
  if (!p.wikidata?.length) continue;
  const q = `SELECT ?item (SAMPLE(?ja) AS ?jaL) (SAMPLE(?en) AS ?enL)
      (GROUP_CONCAT(DISTINCT ?genre; separator=" ") AS ?genres) (GROUP_CONCAT(DISTINCT ?dev; separator=" ") AS ?devs) WHERE {
    VALUES ?p { ${p.wikidata.map((x) => `wd:${x}`).join(' ')} }
    ?item wdt:P400 ?p .
    OPTIONAL { ?item rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
    OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
    OPTIONAL { ?item wdt:P136 ?genre }
    OPTIONAL { ?item wdt:P178 ?dev }
  } GROUP BY ?item`;
  const rows = await sparql(q, `${p.id} のソフト一覧`);
  const idx = new Map();
  for (const r of rows) {
    const q2 = qid(r.item.value);
    const it = itemOf(q2);
    it.isGame = true;
    for (const w of p.wikidata) it.platforms.add(w);
    for (const g of (r.genres?.value || '').split(' ').filter(Boolean)) it.genres.add(qid(g));
    for (const d of (r.devs?.value || '').split(' ').filter(Boolean)) it.devs.add(qid(d));
    for (const l of [r.jaL?.value, r.enL?.value]) {
      if (!l) continue;
      const k = titleKey(l);
      if (k.length < 2) continue;
      if (!idx.has(k)) idx.set(k, new Set());
      idx.get(k).add(q2);
    }
  }
  labelIndex.set(p.id, idx);
  console.log(`  ${p.id}: Wikidata上のソフト ${rows.length}件`);
}

// ---------- ジャンル・開発元のラベルを取得 ----------
const needLabels = new Set();
for (const it of items.values()) { it.genres.forEach((g) => needLabels.add(g)); it.devs.forEach((d) => needLabels.add(d)); }
const labels = new Map(); // QID → { ja, en }
const ids = [...needLabels];
for (let i = 0; i < ids.length; i += 400) {
  const batch = ids.slice(i, i + 400);
  const q = `SELECT ?x ?ja ?en WHERE {
    VALUES ?x { ${batch.map((x) => `wd:${x}`).join(' ')} }
    OPTIONAL { ?x rdfs:label ?ja FILTER(LANG(?ja) = "ja") }
    OPTIONAL { ?x rdfs:label ?en FILTER(LANG(?en) = "en") }
  }`;
  for (const r of await sparql(q, `ラベル ${i + 1}〜`)) labels.set(qid(r.x.value), { ja: r.ja?.value, en: r.en?.value });
}
const genreCache = new Map();
const genresOf = (it) => {
  const out = new Set();
  for (const g of it.genres) {
    if (!genreCache.has(g)) {
      const l = labels.get(g) || {};
      genreCache.set(g, mapGenreLabels([l.ja, l.en]));
    }
    genreCache.get(g).forEach((x) => out.add(x));
  }
  return [...out];
};

// ---------- ソフトに反映 ----------
const summary = [];
for (const p of targets) {
  const games = gamesByPlatform.get(p.id);
  const idx = labelIndex.get(p.id);
  const pq = new Set(p.wikidata || []);
  let byArticle = 0, byLabel = 0, withGenre = 0, withDev = 0;
  for (const g of games) {
    if (g.lock) continue;
    let q2 = null;
    let viaArticle = false;
    if (g.wiki && articleToItem.has(g.wiki)) {
      const cand = articleToItem.get(g.wiki);
      const it = items.get(cand);
      if (it && (it.isGame || it.isSeries)) { q2 = cand; viaArticle = true; }
    }
    if (!q2 && idx) {
      const keys = [g.title, ...(g.altTitles || [])].map(titleKey);
      for (const k of keys) {
        const hit = idx.get(k);
        if (hit && hit.size === 1) { q2 = [...hit][0]; break; }
      }
    }
    if (!q2) continue;
    const it = items.get(q2);
    const onThisPlatform = [...it.platforms].some((x) => pq.has(x));
    // シリーズ全体の項目や、別機種版の項目の場合は WikidataのIDは記録しない
    if (it.isGame && onThisPlatform) g.wikidata = q2; else delete g.wikidata;
    if (viaArticle) byArticle++; else byLabel++;
    const genres = genresOf(it);
    if (genres.length) { g.genres = genres; withGenre++; }
    // 開発元: 一覧に記載がなく、この機種版のデータと確認できる場合だけ補う
    if (!g.developers?.length && it.isGame && onThisPlatform && it.devs.size && it.devs.size <= 4) {
      const devs = [...it.devs].map((d) => labels.get(d)).map((l) => normalizeMakerName(l?.ja || l?.en || '')).filter((n) => n && !/^Q\d+$/.test(n));
      if (devs.length) { g.developers = devs; withDev++; }
    }
  }
  writeGames(p.id, games.map(orderKeys));
  summary.push({ id: p.id, total: games.length, byArticle, byLabel, withGenre, withDev, genreRate: `${Math.round((withGenre / Math.max(1, games.length)) * 100)}%` });
}
console.table(summary);

// 開発元が増えたのでメーカー一覧も更新
const all = platforms.flatMap((p) => readGames(p.id));
const mk = updateMakers(all);
console.log(`メーカー: ${mk.total}社（新規 ${mk.added}）`);
