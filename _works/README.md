# 作品の元データ

作品ページ(`philosophy/<slug>.html`)、トップページの書棚と JSON-LD、表紙の色(`site.css`)、
`sitemap.xml` は、このフォルダの中身から `_tools/build.mjs` で作ります。
**生成されたファイルは直接書きかえず**、ここを直してからビルドしてください。

名前が `_` で始まるフォルダは GitHub Pages(Jekyll)が公開しないので、ここはサイトには出ません。

## ファイル

| ファイル | 中身 |
|---|---|
| `works.json` | サイトの URL、固定ページの更新日、作品の一覧(書棚に並ぶ順) |
| `page.html` | 作品ページのひな形(`{{WORK}}` などに値が入る) |
| `<slug>/body.html` | 本文(表紙のあとに入る。字下げなしで書く) |
| `<slug>/info.html` | 「解説」パネルの中身(作品について・訳注・原典など)。「この訳について」はひな形に入っている |

## 作品を1本追加する

1. `works.json` の `works` に1件足す(書棚の並びはこの順)。

   | 項目 | 例 | 使われる場所 |
   |---|---|---|
   | `slug` | `kant-aufklaerung` | ファイル名・URL(半角英小文字・数字・ハイフン) |
   | `title` / `author` | `啓蒙とは何か` / `カント` | どこでも |
   | `authorDates` | `1724–1804` | 表紙 |
   | `year` / `language` | `1784` / `ドイツ語` | 書棚の説明、表紙、JSON-LD |
   | `range` | `全訳` | タイトルの(全訳)、書棚のバッジ |
   | `originalTitle` | `Beantwortung der Frage: …` | JSON-LD |
   | `description` | 検索結果・SNS に出る説明文 | meta description、OGP、JSON-LD |
   | `shelfNote` | `「…」。` | 書棚の説明の後半、OGP 画像の一行 |
   | `genre` | `政治・社会` | 表紙と OGP 画像の色(`genres` の色。YouTube のサムネイルと同じ) |
   | `updated` | `2026-11-07` | サイトマップ(トップの更新日にも反映) |
   | `ogpNote`(任意) | | OGP 画像の一行を `shelfNote` と変えたいとき |
   | `books`(任意) | `[{ "title": "啓蒙とは何か 他四篇(岩波文庫)", "url": "https://…" }]` | 「解説」パネルの「紙の本で読む」(下の「紙の本の購入リンク」) |

2. `<slug>/body.html` と `<slug>/info.html` を作る(既存の作品をまねる)。
3. ビルドする。

   ```bash
   node _tools/build.mjs
   ```

4. OGP 画像(`ogp/<slug>.png`)がまだなければ作る(Playwright が必要)。

   ```bash
   node _tools/build.mjs --ogp
   ```

5. 生成されたファイルもあわせてコミットする。プルリクエストでは CI が
   `node _tools/build.mjs --check` を走らせ、ビルドし忘れがあれば失敗します。

トップページの紹介文や `meta description` など、印(`ここから自動生成` 〜 `ここまで自動生成`)の外は
これまでどおり `index.html` を直接直します。

## 紙の本の購入リンク(広告)

作品に `books` を書くと、「解説」パネルの最後(「この訳について」の前)に「紙の本で読む」の欄ができます。
紙面(本文)には出ません。リンクには「広告」の表示と `rel="sponsored"` が付きます。

- `url` には、アフィリエイトのサービスで作った購入ページへのリンク(`https://` で始まるもの)をそのまま入れます。
- **最初の1件を載せる前に `privacy.html` の「広告・アフィリエイトについて」を書きかえてください。**
  「掲載していません」のままだとビルドが失敗します。利用するサービスの名前、そのサービスが求める表示
  (たとえば Amazon アソシエイトの定型文)、Cookie などによる情報の取り扱いを書き、`works.json` の `pages` の
  `privacy.html` の `lastmod` も今日の日付にします。
- 画像つきのバナーや外部のスクリプトは使いません(ページの CSP で止まります)。文字のリンクだけです。
