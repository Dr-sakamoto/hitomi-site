#!/usr/bin/env node
// ===== ほらあな哲学書庫 ビルド =====
// _works/works.json(作品の情報)と _works/<slug>/body.html・info.html(本文・解説)から、
// 次のファイルを作る。外部のパッケージは使わない(Node.js 18 以上)。
//
//   philosophy/<slug>.html       作品ページ(_works/page.html がひな形)
//   index.html                   書棚と JSON-LD の作品一覧(印のあいだだけ書きかえる)
//   site.css                     表紙の色と肖像の絵(印のあいだだけ書きかえる)
//   sitemap.xml                  全体
//
// 使い方:
//   node _tools/build.mjs           ファイルを書き出す
//   node _tools/build.mjs --check   書き出さずに、生成結果とずれているファイルがあれば失敗する(CI 用)
//   node _tools/build.mjs --ogp     OGP 画像(ogp/<slug>.png)のうち、無いものを Playwright で作る
//   node _tools/build.mjs --ogp-all OGP 画像をすべて作り直す

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const OGP_ALL = args.has('--ogp-all');
const OGP = OGP_ALL || args.has('--ogp');

const MARK_START = 'ここから自動生成(_tools/build.mjs)';
const MARK_END = 'ここまで自動生成';

const errors = [];
const warnings = [];

function abs(p) { return path.join(ROOT, p); }
function read(p) { return fs.readFileSync(abs(p), 'utf8'); }
function exists(p) { return fs.existsSync(abs(p)); }

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function indent(text, n) {
    const pad = ' '.repeat(n);
    return text.replace(/\s+$/, '').split('\n').map((l) => (l.trim() ? pad + l : '')).join('\n');
}

// JSON を <script> の中に安全に埋めこむ(</script> で閉じられないように)
function jsonForScript(obj) {
    return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

function fill(template, vars, where) {
    return template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
        if (!(key in vars)) {
            errors.push(`${where}: ひな形の {{${key}}} に入れる値がない`);
            return m;
        }
        return vars[key];
    });
}

// 印のあいだを差しかえる。印は HTML なら <!-- … -->、CSS なら /* … */
function replaceBetweenMarks(file, text, content, comment) {
    const [open, close] = comment === 'css' ? ['/* ', ' */'] : ['<!-- ', ' -->'];
    const start = open + MARK_START + close;
    const end = open + MARK_END + close;
    const i = text.indexOf(start);
    const j = text.indexOf(end);
    if (i < 0 || j < 0 || j < i) {
        errors.push(`${file}: 自動生成の印(${start} … ${end})が見つからない`);
        return text;
    }
    // 印の行の字下げを中身にも使う
    const lineStart = text.lastIndexOf('\n', i) + 1;
    const pad = text.slice(lineStart, i);
    const endLineStart = text.lastIndexOf('\n', j) + 1;
    return text.slice(0, i + start.length) + '\n' + indent(content, pad.length) + '\n' + text.slice(endLineStart);
}

// ---------- 作品情報を読んで確かめる ----------
const data = JSON.parse(read('_works/works.json'));
const SITE = data.site;
if (!/^https:\/\/.+\/$/.test(SITE.url || '')) { errors.push('works.json: site.url は https:// で始まり / で終わる URL にする'); }

const REQUIRED = ['slug', 'title', 'author', 'authorDates', 'year', 'language', 'range',
    'originalTitle', 'description', 'shelfNote', 'genre', 'updated'];
const seen = new Set();
const works = data.works.filter((w, n) => {
    const where = `works.json の works[${n}]${w.slug ? '(' + w.slug + ')' : ''}`;
    const missing = REQUIRED.filter((k) => w[k] === undefined || w[k] === '');
    if (missing.length) { errors.push(`${where}: ${missing.join(', ')} がない`); return false; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.slug)) { errors.push(`${where}: slug は半角英小文字・数字・ハイフンだけにする`); return false; }
    if (seen.has(w.slug)) { errors.push(`${where}: slug が重複している`); return false; }
    seen.add(w.slug);
    // 表紙の色はジャンルで決まる(works.json の genres)。サムネイル・動画と同じ色
    w.coverColor = (data.genres || {})[w.genre];
    if (!w.coverColor) { errors.push(`${where}: genre「${w.genre}」が works.json の genres にない`); }
    else if (!/^#[0-9a-fA-F]{6}$/.test(w.coverColor)) { errors.push(`works.json の genres「${w.genre}」は #rrggbb の形にする`); }
    // 表紙と OGP 画像に使う著者の肖像の網点(任意)。art/<portrait>-cover.png と -wide.png(作り方は _works/README.md)
    if (w.portrait !== undefined) {
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.portrait)) { errors.push(`${where}: portrait は半角英小文字・数字・ハイフンだけにする`); return false; }
        for (const f of [`art/${w.portrait}-cover.png`, `art/${w.portrait}-wide.png`]) {
            if (!exists(f)) { errors.push(`${where}: ${f} がない(非公開リポジトリの studio/thumb/make_site_art.py で作る)`); }
        }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.updated)) { errors.push(`${where}: updated は YYYY-MM-DD の形にする`); }
    // 紙の本の購入リンク(任意)。解説パネルに「広告」と明記して出す
    if (w.books !== undefined) {
        const ok = Array.isArray(w.books) && w.books.length > 0 &&
            w.books.every((b) => b && typeof b.title === 'string' && b.title.trim() && /^https:\/\/\S+$/.test(b.url || ''));
        if (!ok) { errors.push(`${where}: books は [{ "title": "…", "url": "https://…" }] の形にする(無いなら項目ごと消す)`); return false; }
    }
    for (const f of ['body.html', 'info.html']) {
        if (!exists(`_works/${w.slug}/${f}`)) { errors.push(`${where}: _works/${w.slug}/${f} がない`); return false; }
    }
    return true;
});

const workUrl = (w) => `${SITE.url}philosophy/${w.slug}.html`;
const fullTitle = (w) => `${w.title}(${w.range})`;

// ---------- 生成 ----------
const outputs = new Map(); // パス → 中身

// 解説パネルの「紙の本で読む」(works.json の books がある作品だけ)
function booksSection(w) {
    if (!w.books) { return ''; }
    return '\n' + [
        '<section class="shop">',
        '    <h2>紙の本で読む</h2>',
        '    <p class="pr-note">広告:以下は書籍の購入ページへのアフィリエイトリンクです。</p>',
        '    <ul>',
        ...w.books.map((b) => `        <li><a href="${escapeHtml(b.url)}" rel="sponsored noopener">${escapeHtml(b.title)}</a></li>`),
        '    </ul>',
        '</section>'
    ].join('\n') + '\n';
}

// 広告を載せるなら、プライバシーポリシーの「掲載していません」を先に直す
const NO_ADS = '広告やアフィリエイトリンクを掲載していません';
if (works.some((w) => w.books) && read('privacy.html').includes(NO_ADS)) {
    errors.push(`privacy.html: 「${NO_ADS}」のままになっている。books を載せる前に、利用するサービスと情報の取り扱いを書く(_works/README.md)`);
}

// 作品ページ
// ビューワーの JS・CSS を書きかえたら URL も変わるようにする(?v=…)。
// ファイル名が同じだと、ブラウザが古いファイルを使い続けることがあるため。
const assetVersion = crypto.createHash('sha256')
    .update(read('philosophy/reader.js')).update(read('philosophy/reader.css'))
    .digest('hex').slice(0, 10);
const pageTemplate = read('_works/page.html');
for (const w of works) {
    const jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: fullTitle(w),
        inLanguage: 'ja',
        author: { '@type': 'Person', name: w.author },
        translator: { '@type': 'Organization', name: 'Claude (AI)' },
        translationOfWork: { '@type': 'Book', name: w.originalTitle, inLanguage: w.language },
        isAccessibleForFree: true,
        url: workUrl(w),
        description: w.description,
        isPartOf: { '@type': 'Collection', name: SITE.name, url: SITE.url }
    };
    const html = fill(pageTemplate, {
        ASSET_VER: assetVersion,
        WORK: escapeHtml(w.title),
        AUTHOR: escapeHtml(w.author),
        RANGE: escapeHtml(w.range),
        DATES: escapeHtml(w.authorDates),
        LANG: escapeHtml(w.language),
        DESC: escapeHtml(w.description),
        URL: escapeHtml(workUrl(w)),
        OGP_IMAGE: escapeHtml(`${SITE.url}ogp/${w.slug}.png`),
        JSONLD: jsonForScript(jsonld),
        BODY: indent(read(`_works/${w.slug}/body.html`), 4).replace(/^ {4}/, ''),
        INFO: indent(read(`_works/${w.slug}/info.html`) + booksSection(w), 8)
    }, `_works/page.html(${w.slug})`);
    outputs.set(`philosophy/${w.slug}.html`, html);
    if (!exists(`ogp/${w.slug}.png`) && !OGP) {
        warnings.push(`ogp/${w.slug}.png がない(node _tools/build.mjs --ogp で作れる)`);
    }
}

// トップページ:書棚と JSON-LD
{
    let html = read('index.html');
    // 読書状態・お気に入り・進捗の欄は shelf.js が使う
    const shelf = works.map((w) => {
        const href = `philosophy/${w.slug}.html`;
        const t = escapeHtml(w.title);
        // 長い題名は表紙で途中から折り返すと読みにくいので、字を小さくして1列に収める(site.css の .title.long)
        const titleClass = [...w.title].length >= 8 ? 'title long' : 'title';
        return [
            `<li data-book="${href}">`,
            `    <a class="book-cover" href="${href}" data-cover="${w.slug}">`,
            `        <span class="${titleClass}">${t}</span>`,
            // 色だけでジャンルを伝えない(色覚によっては見分けにくい組がある)ので、名前も出す
            '        <span class="foot">',
            `            <span class="author">${escapeHtml(w.author)}</span>`,
            `            <span class="genre">${escapeHtml(w.genre)}</span>`,
            '        </span>',
            '        <span class="progress-bar" aria-hidden="true"></span>',
            '    </a>',
            `    <div class="book-info">${w.year}年/${escapeHtml(w.language)}原典より。${escapeHtml(w.shelfNote)}</div>`,
            '    <div class="book-meta">',
            '        <span class="progress-text">未読</span>',
            `        <select class="status-select" aria-label="「${t}」の読書状態">`,
            '            <option value="">未設定</option>',
            '            <option value="want">読みたい</option>',
            '            <option value="reading">読書中</option>',
            '            <option value="done">読了</option>',
            '        </select>',
            `        <button type="button" class="fav-btn" aria-pressed="false" aria-label="「${t}」をお気に入りにする">☆</button>`,
            '    </div>',
            '</li>'
        ].join('\n');
    }).join('\n');
    html = replaceBetweenMarks('index.html', html, shelf, 'html');

    const m = html.match(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n\s*<\/script>)/);
    if (!m) {
        errors.push('index.html: JSON-LD の <script> が見つからない');
    } else {
        let ld;
        try { ld = JSON.parse(m[2]); } catch (e) { errors.push('index.html: JSON-LD が JSON として読めない:' + e.message); }
        if (ld) {
            ld.mainEntity = ld.mainEntity || { '@type': 'ItemList' };
            ld.mainEntity.itemListElement = works.map((w, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: workUrl(w),
                name: `${fullTitle(w)}/${w.author}`
            }));
            html = html.replace(m[0], m[1] + jsonForScript(ld) + m[3]);
        }
    }
    outputs.set('index.html', html);
}

// 表紙の色(インラインの style は CSP で止まるので CSS に書く)
{
    const css = works.map((w) => `.book-cover[data-cover="${w.slug}"] { --cover: ${w.coverColor};` +
        (w.portrait ? ` background-image: url(art/${w.portrait}-cover.png);` : '') + ' }').join('\n');
    outputs.set('site.css', replaceBetweenMarks('site.css', read('site.css'), css, 'css'));
}

// サイトマップ:トップ → 作品 → そのほかのページ。トップの更新日は作品の更新日も見る
{
    const latest = (a, b) => (a > b ? a : b);
    const urls = [];
    data.pages.forEach((p, i) => {
        let lastmod = p.lastmod;
        if (p.path === '') { lastmod = works.reduce((d, w) => latest(d, w.updated), lastmod); }
        urls.push({ loc: SITE.url + p.path, lastmod });
        if (i === 0) { works.forEach((w) => urls.push({ loc: workUrl(w), lastmod: w.updated })); }
    });
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n') +
        '\n</urlset>\n';
    outputs.set('sitemap.xml', xml);
}

// works.json に無い作品ページが残っていないか
for (const f of fs.readdirSync(abs('philosophy'))) {
    if (f.endsWith('.html') && !outputs.has(`philosophy/${f}`)) {
        warnings.push(`philosophy/${f} は works.json に載っていない(消し忘れ?)`);
    }
}

// ---------- 書き出し / 照合 ----------
for (const w of warnings) { console.warn('注意: ' + w); }
if (errors.length) {
    for (const e of errors) { console.error('エラー: ' + e); }
    process.exit(1);
}

if (CHECK) {
    const stale = [...outputs].filter(([p, c]) => !exists(p) || read(p) !== c).map(([p]) => p);
    if (stale.length) {
        console.error('生成結果とずれているファイルがある。node _tools/build.mjs を実行してコミットしてください:');
        for (const p of stale) { console.error('  ' + p); }
        process.exit(1);
    }
    console.log(`OK(${outputs.size} ファイルは生成結果と一致)`);
} else {
    let changed = 0;
    for (const [p, c] of outputs) {
        if (exists(p) && read(p) === c) { continue; }
        fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
        fs.writeFileSync(abs(p), c);
        console.log('書き出し: ' + p);
        changed++;
    }
    if (!changed) { console.log('変更なし'); }
}

if (OGP) { await makeOgp(); }

// ---------- OGP 画像 ----------
async function makeOgp() {
    const targets = works.filter((w) => OGP_ALL || !exists(`ogp/${w.slug}.png`));
    if (!targets.length && exists('ogp/site.png')) { console.log('OGP 画像:作るものはない'); return; }
    let chromium;
    try {
        // 実行した場所の node_modules か、グローバルにある playwright を使う
        const require = createRequire(path.join(process.cwd(), 'noop.js'));
        ({ chromium } = require('playwright'));
    } catch (e) {
        console.error('OGP 画像を作るには Playwright が必要です(npm i -D playwright && npx playwright install chromium)');
        process.exit(1);
    }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const w of targets) {
        const q = new URLSearchParams({ title: w.title, author: w.author, note: w.ogpNote || w.shelfNote, color: w.coverColor });
        if (w.portrait) { q.set('art', `../art/${w.portrait}-wide.png`); }
        await page.goto(pathToFileURL(abs('ogp/_card.html')).href + '?' + q.toString());
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({ path: abs(`ogp/${w.slug}.png`) });
        console.log(`書き出し: ogp/${w.slug}.png`);
    }
    // 書庫全体用(ogp/site.png):無いとき・作り直すときだけ
    if (OGP_ALL || !exists('ogp/site.png')) {
        await page.goto(pathToFileURL(abs('ogp/_card.html')).href);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        await page.screenshot({ path: abs('ogp/site.png') });
        console.log('書き出し: ogp/site.png');
    }
    await browser.close();
}
