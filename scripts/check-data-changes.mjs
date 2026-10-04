/**
 * 自動更新の安全装置：取り込み後のデータを、保存済み（コミット済み）のデータと比べて、
 * 変更が多すぎる場合はエラーで止めます（データは保存されず、サイトもそのままです）。
 *
 * Wikipedia の記事が荒らされたり、一覧ページが分割・改名されたりすると、
 * 大量のソフトが「消えた」「タイトルや発売日が変わった」ように見えるためです。
 * 止まった場合は GitHub からメールが届くので、Claude に確認を頼んでください。
 *
 * 使い方: node scripts/check-data-changes.mjs
 *   問題がないと確認できた大量変更を保存するときは、Actions の「データを自動更新」を
 *   手動実行（Run workflow）し、「安全装置を無視して保存する」にチェックを入れます。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

// 1回の更新で許容する変更の上限（毎週の通常の更新は数十〜200件程度）
const LIMITS = {
  missing: 100, // 一覧から消えたソフト
  title: 200, // タイトルが変わったソフト
  date: 200, // 発売日が変わったソフト
  added: 1500, // 新しく増えたソフト
  missingRatio: 0.2, // 1機種で、全体のこの割合以上が消えたら止める
};

function committed(path) {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return []; // 新しく増えたファイル
  }
}

const count = { added: 0, missing: 0, removed: 0, title: 0, date: 0 };
const examples = { added: [], missing: [], removed: [], title: [], date: [] };
const problems = [];
const note = (kind, text) => {
  count[kind]++;
  if (examples[kind].length < 10) examples[kind].push(text);
};

for (const file of readdirSync('data/games').filter((f) => f.endsWith('.json')).sort()) {
  const path = `data/games/${file}`;
  const before = new Map(committed(path).map((g) => [g.id, g]));
  const after = new Map(JSON.parse(readFileSync(path, 'utf8')).map((g) => [g.id, g]));
  let missingHere = 0;
  for (const [id, old] of before) {
    const now = after.get(id);
    if (!now) {
      note('removed', `${id} ${old.title}`);
      continue;
    }
    if (!old.missingFromSource && now.missingFromSource) {
      note('missing', `${id} ${old.title}`);
      missingHere++;
    }
    if (old.title !== now.title) note('title', `${id} ${old.title} → ${now.title}`);
    if (old.date !== now.date) note('date', `${id} ${old.title}: ${old.date ?? '未定'} → ${now.date ?? '未定'}`);
  }
  for (const [id, g] of after) if (!before.has(id)) note('added', `${id} ${g.title}`);
  if (before.size >= 50 && missingHere / before.size >= LIMITS.missingRatio) {
    problems.push(`${file}: 全${before.size}本のうち${missingHere}本が一覧から消えました`);
  }
}

if (count.removed > 0) problems.push(`ソフトのデータ自体が${count.removed}件なくなっています（通常は起きません）`);
if (count.missing > LIMITS.missing) problems.push(`一覧から消えたソフトが${count.missing}件あります（上限${LIMITS.missing}件）`);
if (count.title > LIMITS.title) problems.push(`タイトルが変わったソフトが${count.title}件あります（上限${LIMITS.title}件）`);
if (count.date > LIMITS.date) problems.push(`発売日が変わったソフトが${count.date}件あります（上限${LIMITS.date}件）`);
if (count.added > LIMITS.added) problems.push(`新しいソフトが${count.added}件あります（上限${LIMITS.added}件）`);

const labels = { added: '追加', missing: '一覧から消えた', removed: 'データ自体が消えた', title: 'タイトル変更', date: '発売日変更' };
console.log('今回の変更:');
for (const kind of Object.keys(count)) {
  console.log(`  ${labels[kind]}: ${count[kind]}件`);
  for (const e of examples[kind]) console.log(`      ${e}`);
}

if (problems.length) {
  console.error('\n⚠ 変更が多すぎるため、安全のためデータを保存せずに止めました。');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Wikipedia 側の荒らしや、一覧ページの分割・改名の可能性があります。Claude に確認を頼んでください。');
  process.exit(1);
}
console.log('\n変更の量は通常の範囲内です。');
