# クリア記録の置き場所（data/clears/）

クリア側が出力した記録を、**1本のソフトにつき1フォルダ** でここに置き、`main` に push すると約10分でサイトに公開されます。
フォルダを消して push すれば、そのソフトのページは元の表示に戻ります。

```
data/clears/
  fc-66/                ← フォルダ名＝ソフトID（slug）
    site.json
    shots/
      001.png
      002.png
```

## ソフトID（slug）

- サイトのソフトのページ `/games/<slug>/` の `<slug>` です（例：スーパーマリオブラザーズは `fc-66`）
- 全件の一覧は公開サイトの **`/data/games.csv`**（毎日のビルドで更新）にあります
  - 列：`slug, title, platform, platform_name, release_date, publisher, download_only`
- ソフトIDは、Wikipedia からの再取り込みでも変わりません

## site.json で使う項目

| 項目 | サイトでの使い方 |
| --- | --- |
| `record.criterion` | クリア記録の表「クリア条件」 |
| `record.result` | 「結果」 |
| `record.cleared_on` | 「クリア日」（`YYYY-MM-DD`）。企画ページの「最近クリアしたソフト」にも使います |
| `record.play_time` / `record.video_time` | 「プレイ時間」「動画の長さ」（書かれた文字のまま表示） |
| `record.deaths` | 「ミスの回数」 |
| `record.losses[]` | 「ミスした場面」。文字か、`{ "time": …, "cause": … }` のような組。組は値を空白でつないで表示します |
| `record.fast_forward[]` | 「動画で早送りした区間」。`{ "start": …, "end": … }` は「start〜end」と表示します |
| `video.youtube_id` | 埋め込む YouTube 動画のID（11文字）。押したときだけ読み込みます |
| `video.title` | 動画の説明（再生ボタンの読み上げ用） |
| `chapters[]` | `{ "seconds": 秒, "time": "表示用", "title": "見出し" }`。一覧を押すと動画のその秒から再生します |
| `guide_md` | 攻略記事（Markdown）。サイト側でHTMLに変換します |
| `images[]` | `{ "file", "width", "height", "alt" }`。記事の画像。`file` は `shots/` の中のファイル名 |

- `key` などそのほかの項目は、置いておいてかまいません（表示には使いません）
- `title`・`platform`・`release_date`・`publisher`・`genre`・`price` は、サイトのデータを優先します（題名が違うと確認で注意が出ます）
- `guide_html` は使いません（安全のため、サイト側で `guide_md` から作ります）

## 記事（guide_md）の書き方

- `##` の見出しは次の9種類です。記事の上に目次として並びます
  `このゲームについて` / `操作方法` / `チャート` / `攻略法` / `敵・アイテム` / `マップ` / `小技・裏技` / `パラメータ` / `動画について`
- `## チャート` の中の `###` 見出しが `chapters` の `title` と同じ文字なら、見出しの横に「▶ 時間」ボタンが付き、押すと動画のその秒へ移動します
- 画像は `![説明](shots/001.png)` のように書きます（ファイル名で `images[]` と照合します）
  - 幅400px以下の画像は2倍に拡大し、`image-rendering: pixelated` でドットをくっきり表示します
- 表（`| a | b |`）、箇条書き、太字などの Markdown が使えます
- HTMLタグは使えません（文字としてそのまま表示されます）。リンクは `http(s)://` のみ（新しいタブで開きます）

## 画像（shots/）

- ファイル名は半角英数字と `. _ -` だけ、形式は png / jpg / gif / webp
- 1ファイル25MiBまで。1本あたり3MBまでが目安です
- 公開URLは `/clears/<slug>/<ファイル名>` です

## 公開前の確認

```bash
node scripts/clears/check.mjs          # すべて
node scripts/clears/check.mjs fc-66    # 1本だけ
```

- **エラー**（フォルダ名がソフトIDでない、site.json が読めない、画像がない など）のソフトは、サイトに表示されません。ほかのソフトの公開には影響しません
- **注意**（チャートの見出しとチャプターが合わない、サイトに出す文に「AI」「エミュレータ」などの言葉がある など）は、表示はされますが直すのがおすすめです

## push のしかた（自動化する場合）

```bash
git pull --rebase origin main     # ほかの自動更新（毎週のデータ更新など）と重ならないように
cp -r 出力フォルダ/fc-66 data/clears/
node scripts/clears/check.mjs fc-66
git add data/clears/fc-66
git commit -m "クリア記録: fc-66 スーパーマリオブラザーズ"
git push origin main
```

## サイトに表示されるもの

- ソフトのページ：題名の上に「クリア済み」、クリア記録（動画・チャプター・記録の表）、攻略情報（目次付き）
- ハード一覧・トップページ・各機種のページ：クリア数と達成率（クリア数 ÷ 発売済みの対象ソフト数）
- 発売日順クリア企画のページ（/playlog/）：スプレッドシートの記録と合わせて数えます
- クリア記録がないソフトのページは、これまでどおりです
