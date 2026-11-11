// ===== ほらあな哲学書庫 ビューワー =====
// 本文(#pages)を CSS 段組みでページに分け、クリック・キー・スワイプでめくる(スワイプは進むだけ)。
// 読書設定(書字方向・文字サイズ・1ページの行数・1行の文字数・行間・書体・背景・ルビ)と
// 読んでいた位置は、この端末のブラウザに記憶する。

(function () {
    var root = document.documentElement;
    var body = document.body;
    var book = document.getElementById('book');
    var pages = document.getElementById('pages');
    var countEl = document.getElementById('count');
    var barEl = document.getElementById('bar');
    var GAP = 80;           // ページとページのすき間(px)
    var page = 0;
    var total = 1;

    var DEFAULTS = {
        mode: 'vertical',   // vertical | horizontal
        fs: 18,             // 文字サイズ(px)
        lines: 0,           // 1ページの行数(0 = 画面に合わせる)
        chars: 0,           // 1行の文字数(0 = 画面に合わせる)
        lh: 1.85,           // 行間
        font: 'mincho',     // mincho | gothic
        theme: 'auto',      // auto | paper | white | dark
        ruby: 'first',      // first(初出のみ)| all(すべて)| none(なし)
        flip: 'auto'        // auto(端末の「動きを減らす」に従う)| curl(紙をめくる)| none(切りかえるだけ)
    };

    function load(key, fallback) {
        try {
            var v = localStorage.getItem('horaana:' + key);
            return v === null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function save(key, value) {
        try {
            localStorage.setItem('horaana:' + key, value);
        } catch (e) { /* 保存できない環境でも読めればよい */ }
    }

    var settings = (function () {
        var s = {};
        var stored = {};
        try { stored = JSON.parse(load('settings', '{}')) || {}; } catch (e) { stored = {}; }
        // 以前の版の保存値を引き継ぐ
        if (!stored.mode && load('mode', null)) { stored.mode = load('mode', null); }
        if (!stored.fs && load('fs', null)) { stored.fs = parseInt(load('fs', null), 10); }
        for (var k in DEFAULTS) { s[k] = valid(k, stored[k]) ? stored[k] : DEFAULTS[k]; }
        return s;
    })();

    // 保存値は HTML にも埋め込むので、決まった形の値だけを受け入れる
    function valid(key, v) {
        switch (key) {
            case 'mode': return v === 'vertical' || v === 'horizontal';
            case 'font': return v === 'mincho' || v === 'gothic';
            case 'theme': return v === 'auto' || v === 'paper' || v === 'white' || v === 'dark';
            case 'ruby': return v === 'first' || v === 'all' || v === 'none';
            case 'flip': return v === 'auto' || v === 'curl' || v === 'none';
            case 'fs': return typeof v === 'number' && v % 1 === 0 && v >= 14 && v <= 28;
            case 'lines': return typeof v === 'number' && v % 1 === 0 && v >= 0 && v <= 40;
            case 'chars': return typeof v === 'number' && v % 1 === 0 && v >= 0 && v <= 60;
            case 'lh': return typeof v === 'number' && v >= 1.2 && v <= 3;
            default: return false;
        }
    }

    function saveSettings() { save('settings', JSON.stringify(settings)); }

    // 読書位置は本棚のプロフィールごとに記憶する(既定の「ゲスト」は従来のキーのまま)
    var posKey = (function () {
        var id = 'default';
        try {
            var p = JSON.parse(load('profiles', 'null'));
            if (p && typeof p.current === 'string' && /^[a-z0-9]{1,20}$/.test(p.current)) id = p.current;
        } catch (e) { /* 既定のまま */ }
        return id === 'default' ? 'pos:' + location.pathname : 'p:' + id + ':pos:' + location.pathname;
    })();

    function isVertical() { return settings.mode === 'vertical'; }

    // ---------- 設定を画面に反映 ----------
    function applyStyle() {
        body.classList.toggle('vertical', isVertical());
        root.style.setProperty('--fs', settings.fs + 'px');
        root.style.setProperty('--lh', String(settings.lh));
        root.classList.toggle('font-gothic', settings.font === 'gothic');
        if (settings.font === 'gothic' && !document.getElementById('font-gothic-css')) {
            // ゴシック体は選ばれたときだけ読み込む(明朝だけの人の読み込みを増やさない)
            var link = document.createElement('link');
            link.id = 'font-gothic-css';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
            document.head.appendChild(link);
            if (document.fonts && document.fonts.load) {
                document.fonts.load('16px "Noto Sans JP"').then(function () { layout(true); });
            }
        }
        if (settings.theme === 'auto') {
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', settings.theme);
        }
        root.classList.toggle('ruby-none', settings.ruby === 'none');
        setAutoRuby(settings.ruby === 'all');
        var modeBtn = document.getElementById('mode');
        if (modeBtn) { modeBtn.textContent = isVertical() ? '横書き' : '縦書き'; }
    }

    // ---------- ルビ ----------
    // 本文の HTML には、作品で初めて出たところにだけ <ruby> を書いている。
    // 「すべて」を選んだときは、同じ語の2回目以降にも同じ読みのルビを足す(class="ruby-auto")。
    var autoRubyOn = false;

    function rubyDictionary() {
        var dict = {};
        var list = pages.querySelectorAll('ruby:not(.ruby-auto)');
        for (var i = 0; i < list.length; i++) {
            var rt = list[i].querySelector('rt');
            if (!rt) { continue; }
            var base = '';
            for (var n = list[i].firstChild; n; n = n.nextSibling) {
                if (n.nodeType === 3) { base += n.nodeValue; }
                else if (n.nodeName !== 'RT' && n.nodeName !== 'RP') { base += n.textContent; }
            }
            base = base.trim();
            if (base && !dict[base]) { dict[base] = rt.textContent.trim(); }
        }
        return dict;
    }

    function setAutoRuby(on) {
        if (on === autoRubyOn) { return; }
        autoRubyOn = on;
        if (!on) {
            var autos = pages.querySelectorAll('ruby.ruby-auto');
            for (var i = 0; i < autos.length; i++) {
                var r = autos[i];
                var parent = r.parentNode;
                parent.replaceChild(document.createTextNode(r.getAttribute('data-base')), r);
                parent.normalize();
            }
            return;
        }
        var dict = rubyDictionary();
        var words = Object.keys(dict).sort(function (a, b) { return b.length - a.length; });
        if (!words.length) { return; }
        var re = new RegExp(words.map(function (w) {
            return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|'), 'g');
        var walker = document.createTreeWalker(pages, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var el = node.parentNode;
                if (el.closest('ruby, .cover, script, style')) { return NodeFilter.FILTER_REJECT; }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var targets = [];
        while (walker.nextNode()) { targets.push(walker.currentNode); }
        targets.forEach(function (node) {
            var text = node.nodeValue;
            re.lastIndex = 0;
            if (!re.test(text)) { return; }
            re.lastIndex = 0;
            var frag = document.createDocumentFragment();
            var last = 0;
            text.replace(re, function (m, offset) {
                if (offset > last) { frag.appendChild(document.createTextNode(text.slice(last, offset))); }
                var ruby = document.createElement('ruby');
                ruby.className = 'ruby-auto';
                ruby.setAttribute('data-base', m);
                ruby.appendChild(document.createTextNode(m));
                var rt = document.createElement('rt');
                rt.textContent = dict[m];
                ruby.appendChild(rt);
                frag.appendChild(ruby);
                last = offset + m.length;
                return m;
            });
            if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
            node.parentNode.replaceChild(frag, node);
        });
    }

    // 紙面の大きさを、行数・文字数の設定と画面の大きさから決める
    function sizePages() {
        var cs = getComputedStyle(book);
        var availW = book.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        var availH = book.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        var lineStep = settings.fs * settings.lh;   // 1行が占める幅
        var w = availW;
        var h = availH;
        if (isVertical()) {
            if (settings.lines) { w = Math.min(availW, settings.lines * lineStep); }
            if (settings.chars) { h = Math.min(availH, settings.chars * settings.fs); }
        } else {
            if (settings.lines) { h = Math.min(availH, settings.lines * lineStep); }
            if (settings.chars) { w = Math.min(availW, settings.chars * settings.fs); }
        }
        pages.style.width = Math.floor(w) + 'px';
        pages.style.height = Math.floor(h) + 'px';
        // 実際の行数・文字数を設定パネルに表示する
        var info = document.getElementById('fit-info');
        if (info) {
            var nLines = Math.floor((isVertical() ? w : h) / lineStep);
            var nChars = Math.floor((isVertical() ? h : w) / settings.fs);
            info.textContent = 'いまの紙面:1ページ約' + nLines + '行 × 1行約' + nChars + '字';
        }
    }

    function pageSize() {
        return isVertical() ? pages.clientHeight : pages.clientWidth;
    }

    function layout(keepRatio) {
        curlDrop();   // 組み直すと写しが古くなる
        var ratio = total > 1 ? page / (total - 1) : 0;
        applyStyle();
        sizePages();
        pages.style.columnGap = GAP + 'px';
        // 1段の幅(縦書きなら高さ)を紙面と同じにする → 1段 = 1ページ
        pages.style.columnWidth = pageSize() + 'px';
        var size = pageSize();
        var scrollSize = isVertical() ? pages.scrollHeight : pages.scrollWidth;
        total = Math.max(1, Math.round((scrollSize + GAP) / (size + GAP)));
        if (keepRatio) {
            page = Math.round(ratio * (total - 1));
        }
        go(page, false);
    }

    function go(n, animate) {
        page = Math.max(0, Math.min(total - 1, n));
        var offset = page * (pageSize() + GAP);
        if (isVertical()) {
            pages.scrollLeft = 0;
            pages.scrollTop = offset;
        } else {
            pages.scrollTop = 0;
            pages.scrollLeft = offset;
        }
        countEl.textContent = (page + 1) + ' / ' + total;
        barEl.style.width = (total > 1 ? (page / (total - 1)) * 100 : 100) + '%';
        if (animate) {
            pages.classList.remove('turn');
            void pages.offsetWidth;
            pages.classList.add('turn');
        }
        save(posKey, String(total > 1 ? page / (total - 1) : 0));
    }

    // ---------- ページめくり(紙の角がめくれるアニメーション) ----------
    // 紙面(#book)の写しを2枚作り、1枚は「めくっているページの表」、もう1枚は鏡写しにして
    // 「めくれた紙の裏(文字が透けて見える)」にする。下には本物の紙面(次のページ)が見えている。
    // 紙の角 C を C' まで持ってきたとき、折り目は C と C' の垂直二等分線になる。
    var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var curl = null;        // 進行中のめくり
    var curlParts = null;   // 紙面の写し(組み直すたびに作り直す)

    function reducedMotion() {
        if (settings.flip === 'curl') { return false; }
        if (settings.flip === 'none') { return true; }
        return !!(motionQuery && motionQuery.matches);
    }

    function curlDiv(cls) {
        var d = document.createElement('div');
        d.className = cls;
        return d;
    }

    function curlSheet(cls) {
        var el = book.cloneNode(true);
        el.classList.add('curl-sheet', cls);
        el.removeAttribute('id');
        el.removeAttribute('tabindex');
        Array.prototype.forEach.call(el.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
        var h = el.querySelector('.tap-hint');
        if (h) { h.parentNode.removeChild(h); }
        el.inert = true;
        var p = el.querySelector('.pages');
        p.style.cssText = pages.style.cssText;
        return { el: el, pages: p };
    }

    function curlBuild() {
        if (curlParts) { return curlParts; }
        var layer = curlDiv('curl-layer');
        layer.setAttribute('aria-hidden', 'true');
        var front = curlSheet('curl-front');
        var under = curlDiv('curl-band curl-under');   // 折り目から下のページに落ちる影
        var cast = curlDiv('curl-band curl-cast');     // めくれた紙が表のページに落とす影
        var back = curlSheet('curl-back');
        var shine = curlDiv('curl-band curl-shine');   // 紙の裏の丸みの陰影
        back.el.appendChild(curlDiv('curl-veil'));
        back.el.appendChild(shine);
        layer.appendChild(front.el);
        layer.appendChild(under);
        layer.appendChild(cast);
        layer.appendChild(back.el);
        body.appendChild(layer);
        curlParts = { layer: layer, front: front, back: back, under: under, cast: cast, shine: shine };
        return curlParts;
    }

    function curlDrop() {
        if (curl) { curlFinish(); }
        if (curlParts) {
            curlParts.layer.parentNode.removeChild(curlParts.layer);
            curlParts = null;
        }
    }

    function scrollToPage(el, n) {
        var offset = n * (pageSize() + GAP);
        if (isVertical()) { el.scrollLeft = 0; el.scrollTop = offset; }
        else { el.scrollTop = 0; el.scrollLeft = offset; }
    }

    // 多角形 poly のうち、点 M を通り法線 n の直線の側(sign = 1 なら n の向き)を残す
    function clipHalf(poly, M, n, sign) {
        var out = [];
        for (var i = 0; i < poly.length; i++) {
            var a = poly[i];
            var b = poly[(i + 1) % poly.length];
            var da = sign * ((a[0] - M[0]) * n[0] + (a[1] - M[1]) * n[1]);
            var db = sign * ((b[0] - M[0]) * n[0] + (b[1] - M[1]) * n[1]);
            if (da >= 0) { out.push(a); }
            if ((da >= 0) !== (db >= 0)) {
                var t = da / (da - db);
                out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
        return out;
    }

    function polygon(poly) {
        if (poly.length < 3) { return 'polygon(0 0, 0 0, 0 0)'; }
        return 'polygon(' + poly.map(function (p) {
            return p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px';
        }).join(', ') + ')';
    }

    // 折り目に沿った帯(影やつや)を置く。帯は折り目から dir の向きへ width だけ伸びる。
    function placeBand(el, M, dir, width, opacity) {
        var reach = curl.diag;
        var angle = Math.atan2(dir[1], dir[0]) * 180 / Math.PI;
        el.style.width = Math.max(0, width).toFixed(1) + 'px';
        el.style.height = (reach * 2).toFixed(1) + 'px';
        el.style.transform = 'translate(' + M[0].toFixed(1) + 'px,' + M[1].toFixed(1) + 'px) rotate(' +
            angle.toFixed(2) + 'deg) translateY(' + (-reach).toFixed(1) + 'px)';
        el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    }

    // 角を (x, y) まで持ってきた形を描く
    function curlRender(x, y) {
        var c = curl, P = curlParts;
        c.x = x;
        c.y = y;
        var W = c.w, H = c.h;
        var vx = x - c.cx, vy = y - c.cy;
        var len = Math.sqrt(vx * vx + vy * vy);
        if (len < 0.5) {
            P.front.el.style.clipPath = 'none';
            P.back.el.style.visibility = 'hidden';
            P.under.style.opacity = P.cast.style.opacity = '0';
            return;
        }
        var n = [vx / len, vy / len];
        var M = [(c.cx + x) / 2, (c.cy + y) / 2];
        var rect = [[0, 0], [W, 0], [W, H], [0, H]];
        var lift = clipHalf(rect, M, n, -1);    // めくれ上がった部分(紙面での位置)
        P.front.el.style.clipPath = polygon(clipHalf(rect, M, n, 1));
        // 紙の裏 = めくれた部分を折り目で裏返したもの
        var a = 1 - 2 * n[0] * n[0], b = -2 * n[0] * n[1], d = 1 - 2 * n[1] * n[1];
        var k = 2 * (M[0] * n[0] + M[1] * n[1]);
        P.back.el.style.visibility = lift.length < 3 ? 'hidden' : 'inherit';
        P.back.el.style.clipPath = polygon(lift);
        P.back.el.style.transform = 'matrix(' + [a, b, b, d, k * n[0], k * n[1]].map(function (v) {
            return v.toFixed(5);
        }).join(',') + ')';
        // めくった量(0〜1)。影は、めくりはじめと終わりぎわには薄くする
        var progress = Math.min(1, Math.abs(x - c.cx) / (2 * W));
        var fade = Math.min(1, progress * 8, (1 - progress) * 6);
        var depth = Math.min(len / 2, W * 0.5);  // 折り目から角までのおおよその深さ
        placeBand(P.under, M, [-n[0], -n[1]], Math.max(24, depth * 0.6), fade);
        placeBand(P.cast, M, n, Math.min(len / 2 + 24, W), fade * 0.9);
        // 裏の陰影は写しの中に置く(写しといっしょに裏返る)
        var reach = 0;
        lift.forEach(function (p) {
            reach = Math.max(reach, -((p[0] - M[0]) * n[0] + (p[1] - M[1]) * n[1]));
        });
        placeBand(P.shine, M, [-n[0], -n[1]], Math.max(1, reach), 1);
    }

    // めくりを始める。dir: 1 = 次のページ、-1 = 前のページ。
    // 次へ:いまのページの写しがめくれていき、下に次のページが見える。
    // 前へ:前のページの写しが、めくられた状態から戻ってきて、いまのページにかぶさる。
    function curlStart(dir, fromTop) {
        var P = curlBuild();
        var r = book.getBoundingClientRect();
        var W = r.width, H = r.height;
        var ls = P.layer.style;
        ls.left = r.left + 'px';
        ls.top = r.top + 'px';
        ls.width = W + 'px';
        ls.height = H + 'px';
        P.layer.classList.add('active');
        // めくる側の端:縦書きは左、横書きは右(本と同じ)
        var cx = isVertical() ? 0 : W;
        var cy = fromTop ? 0 : H;
        var from = page;
        var shown = dir > 0 ? page : page - 1;
        scrollToPage(P.front.pages, shown);
        scrollToPage(P.back.pages, shown);
        curl = {
            dir: dir, from: from, w: W, h: H, cx: cx, cy: cy,
            fx: 2 * (W - cx) - cx,      // 裏返しきったときの角の位置(背の向こう側)
            diag: Math.sqrt(W * W + H * H),
            x: cx, y: cy, anim: 0
        };
        if (dir > 0) {
            go(page + 1, false);
            curlRender(cx, cy);
        } else {
            curlRender(curl.fx, cy);
        }
    }

    // 角をつかんで動かしているとき、紙が背から離れないように角の位置をおさえる
    function curlConstrain(x, y) {
        var c = curl;
        var sx = c.w - c.cx;                  // 背(とじ側)の x
        var oy = c.h - c.cy;                  // 反対側の角の y
        var dx = x - sx, dy = y - c.cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > c.w) { x = sx + dx * c.w / dist; y = c.cy + dy * c.w / dist; }
        dx = x - sx; dy = y - oy;
        dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > c.diag) { x = sx + dx * c.diag / dist; y = oy + dy * c.diag / dist; }
        return [x, y];
    }

    // 終わらせる(commit = ページを進める/戻すことを確定するか)
    function curlEnd(commit) {
        var c = curl;
        if (!c) { return; }
        cancelAnimationFrame(c.anim);
        curl = null;
        if (c.dir > 0 && !commit) { go(c.from, false); }
        if (c.dir < 0 && commit) { go(c.from - 1, false); }
        curlParts.layer.classList.remove('active');
    }

    // アニメーション中なら、すぐに行き着く先まで進めて終える
    function curlFinish() {
        if (!curl) { return; }
        curlEnd(curl.target === undefined ? false : curl.target);   // 指でつかんでいる途中なら元に戻す
    }

    // 角を (tx, ty) まで動かして終える。arc を付けると、角が少し持ち上がる弧を描く。
    function curlAnimate(tx, ty, duration, commit, arc) {
        var c = curl;
        var x0 = c.x, y0 = c.y, t0 = 0;
        var lift = (c.cy === 0 ? 1 : -1) * c.h * 0.14;
        c.target = commit;
        cancelAnimationFrame(c.anim);
        function step(now) {
            if (curl !== c) { return; }
            if (!t0) { t0 = now; }
            var u = Math.min(1, (now - t0) / duration);
            var e = arc ? (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2)  // ゆっくり始まりゆっくり終わる
                        : 1 - Math.pow(1 - u, 3);                                     // すっと止まる
            var y = y0 + (ty - y0) * e + (arc ? Math.sin(Math.PI * e) * lift : 0);
            curlRender(x0 + (tx - x0) * e, y);
            if (u < 1) { c.anim = requestAnimationFrame(step); }
            else { curlEnd(commit); }
        }
        c.anim = requestAnimationFrame(step);
    }

    // タップ・キー・ボタンでめくる
    function flip(dir) {
        if (curl) { curlFinish(); }
        var target = page + dir;
        if (target < 0 || target > total - 1) { return; }
        if (reducedMotion()) { go(target, false); return; }
        curlStart(dir, false);
        if (dir > 0) { curlAnimate(curl.fx, curl.cy, 520, true, true); }
        else { curlAnimate(curl.cx, curl.cy, 520, true, true); }
    }

    function next() { flip(1); }
    function prev() { flip(-1); }

    // 画面の左右:縦書きは左へ進み、横書きは右へ進む(本と同じ)
    function goLeft() { if (isVertical()) { next(); } else { prev(); } }
    function goRight() { if (isVertical()) { prev(); } else { next(); } }

    // 紙面の中の要素が何ページ目(0から)にあるか
    function pageOf(el) {
        var pr = pages.getBoundingClientRect();
        var r = el.getBoundingClientRect();
        var pos = isVertical() ? (r.top - pr.top + pages.scrollTop) : (r.left - pr.left + pages.scrollLeft);
        return Math.max(0, Math.min(total - 1, Math.floor((pos + 1) / (pageSize() + GAP))));
    }

    // ---------- 設定パネル ----------
    function option(value, label, current) {
        return '<option value="' + value + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + label + '</option>';
    }

    function radio(name, value, label, current) {
        return '<label><input type="radio" name="' + name + '" value="' + value + '"' +
            (String(value) === String(current) ? ' checked' : '') + '> ' + label + '</label>';
    }

    // ---------- パネル(設定・解説)の開閉 ----------
    // 開いたらパネルの中へフォーカスを移し、閉じたら開いたボタンへ戻す。
    // 開いているあいだは Tab でパネルの外へ出ない。
    var panels = {};   // name -> { el, btn, isOpen(), set(open) }

    function openName() {
        for (var k in panels) { if (panels[k].isOpen()) { return k; } }
        return null;
    }

    function setPanel(name, open, restoreFocus) {
        var p = panels[name];
        if (!p) { return; }
        if (open) {
            for (var k in panels) {
                if (k !== name && panels[k].isOpen()) { setPanel(k, false, false); }
            }
        }
        p.set(open);
        p.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            var first = p.el.querySelector('[data-close]');
            (first || p.el).focus();
        } else if (restoreFocus) {
            p.btn.focus();
        }
    }

    // 開いているパネルがあれば閉じて true を返す
    function closePanels(restoreFocus) {
        var n = openName();
        if (n) { setPanel(n, false, restoreFocus); }
        return !!n;
    }

    function focusables(el) {
        var list = el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        return Array.prototype.filter.call(list, function (x) {
            return !x.disabled && x.getClientRects().length > 0;
        });
    }

    function trapFocus(el, e) {
        var items = focusables(el);
        if (!items.length) { e.preventDefault(); el.focus(); return; }
        var first = items[0];
        var last = items[items.length - 1];
        var active = document.activeElement;
        if (!el.contains(active)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // ---------- 設定パネル ----------
    function buildPanel() {
        var tools = document.querySelector('.bar-tools');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'settings-btn';
        btn.textContent = '設定';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'settings');
        tools.appendChild(btn);

        var lineOpts = [0, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32];
        var charOpts = [0, 20, 25, 30, 35, 40, 45, 50];
        var lhOpts = [[1.6, '狭い'], [1.85, '標準'], [2.1, '広い'], [2.4, 'とても広い']];

        var panel = document.createElement('div');
        panel.id = 'settings';
        panel.className = 'settings';
        panel.hidden = true;
        panel.tabIndex = -1;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '読書設定');
        panel.innerHTML =
            '<div class="settings-head"><b>読書設定</b><button type="button" id="settings-close" data-close aria-label="閉じる">×</button></div>' +
            '<fieldset><legend>書字方向</legend>' +
                radio('mode', 'vertical', '縦書き', settings.mode) +
                radio('mode', 'horizontal', '横書き', settings.mode) +
            '</fieldset>' +
            '<label class="row">文字サイズ <output id="fs-out">' + settings.fs + 'px</output>' +
                '<input type="range" id="set-fs" min="14" max="28" step="1" value="' + settings.fs + '"></label>' +
            '<label class="row">1ページの行数 <select id="set-lines">' +
                lineOpts.map(function (n) { return option(n, n ? n + '行' : '画面に合わせる', settings.lines); }).join('') +
            '</select></label>' +
            '<label class="row">1行の文字数 <select id="set-chars">' +
                charOpts.map(function (n) { return option(n, n ? n + '字' : '画面に合わせる', settings.chars); }).join('') +
            '</select></label>' +
            '<label class="row">行間 <select id="set-lh">' +
                lhOpts.map(function (o) { return option(o[0], o[1], settings.lh); }).join('') +
            '</select></label>' +
            '<fieldset><legend>書体</legend>' +
                radio('font', 'mincho', '明朝', settings.font) +
                radio('font', 'gothic', 'ゴシック', settings.font) +
            '</fieldset>' +
            '<fieldset><legend>背景</legend>' +
                radio('theme', 'auto', '自動', settings.theme) +
                radio('theme', 'paper', '紙', settings.theme) +
                radio('theme', 'white', '白', settings.theme) +
                radio('theme', 'dark', '黒', settings.theme) +
            '</fieldset>' +
            '<fieldset><legend>ルビ</legend>' +
                radio('ruby', 'first', '初出のみ', settings.ruby) +
                radio('ruby', 'all', 'すべて', settings.ruby) +
                radio('ruby', 'none', 'なし', settings.ruby) +
            '</fieldset>' +
            '<fieldset><legend>めくるときの動き</legend>' +
                radio('flip', 'auto', '自動', settings.flip) +
                radio('flip', 'curl', '紙をめくる', settings.flip) +
                radio('flip', 'none', '切りかえ', settings.flip) +
            '</fieldset>' +
            '<p class="fit-note">「自動」は、端末で動きを減らす設定(iPhone の「視差効果を減らす」など)をしていると切りかえになります。</p>' +
            '<p class="fit-info" id="fit-info"></p>' +
            '<p class="fit-note">画面に入りきらない行数・文字数を選ぶと、画面に入るぶんだけ表示します。</p>' +
            '<div class="settings-foot">' +
                '<button type="button" id="settings-hint">めくり方を見る</button>' +
                '<button type="button" id="settings-reset">初期設定に戻す</button>' +
            '</div>';
        body.appendChild(panel);

        panels.settings = {
            el: panel,
            btn: btn,
            isOpen: function () { return !panel.hidden; },
            set: function (open) { panel.hidden = !open; }
        };

        btn.addEventListener('click', function () { setPanel('settings', panel.hidden, true); });
        document.getElementById('settings-close').addEventListener('click', function () { setPanel('settings', false, true); });

        function update(key, value) {
            settings[key] = value;
            saveSettings();
            layout(true);
        }

        panel.addEventListener('change', function (e) {
            var t = e.target;
            if (t.name === 'mode' || t.name === 'font' || t.name === 'theme' || t.name === 'ruby' || t.name === 'flip') { update(t.name, t.value); }
            else if (t.id === 'set-lines') { update('lines', parseInt(t.value, 10)); }
            else if (t.id === 'set-chars') { update('chars', parseInt(t.value, 10)); }
            else if (t.id === 'set-lh') { update('lh', parseFloat(t.value)); }
        });

        var fsInput = document.getElementById('set-fs');
        fsInput.addEventListener('input', function () {
            document.getElementById('fs-out').textContent = fsInput.value + 'px';
            update('fs', parseInt(fsInput.value, 10));
        });

        document.getElementById('settings-hint').addEventListener('click', function () {
            setPanel('settings', false, false);
            showHint();
        });

        document.getElementById('settings-reset').addEventListener('click', function () {
            for (var k in DEFAULTS) { settings[k] = DEFAULTS[k]; }
            saveSettings();
            panel.remove();
            btn.remove();
            buildPanel();
            layout(true);
            setPanel('settings', true);
        });
    }

    // ---------- この本について(解説・訳注・原典) ----------
    function setupInfo() {
        var info = document.getElementById('book-info');
        var infoBtn = document.getElementById('info-btn');
        if (!info || !infoBtn) { return; }
        info.setAttribute('role', 'dialog');
        info.tabIndex = -1;

        // 目次:本文に見出しがある作品だけ、解説パネルの先頭に置く
        var heads = pages.querySelectorAll('h2');
        var tocItems = [];
        if (heads.length) {
            var toc = document.createElement('section');
            toc.className = 'toc';
            toc.innerHTML = '<h2>目次</h2><ol></ol>';
            var ol = toc.querySelector('ol');
            var targets = [[pages.querySelector('.cover'), '表紙']];
            Array.prototype.forEach.call(heads, function (h) { targets.push([h, h.textContent]); });
            targets.push([endEl, '読み終わり']);
            targets.forEach(function (t) {
                if (!t[0]) { return; }
                var li = document.createElement('li');
                var b = document.createElement('button');
                b.type = 'button';
                b.innerHTML = '<span></span><span class="toc-page"></span>';
                b.firstChild.textContent = t[1];
                b.addEventListener('click', function () {
                    setPanel('info', false, false);
                    go(pageOf(t[0]), true);
                    book.focus();
                });
                li.appendChild(b);
                ol.appendChild(li);
                tocItems.push([t[0], b.lastChild]);
            });
            var head = info.querySelector('.info-head');
            head.parentNode.insertBefore(toc, head.nextSibling);
            infoBtn.textContent = '目次・解説';
        }
        function refreshToc() {
            tocItems.forEach(function (t) { t[1].textContent = (pageOf(t[0]) + 1) + 'ページ'; });
        }
        var close = document.getElementById('info-close');
        if (close) {
            close.setAttribute('data-close', '');
            close.addEventListener('click', function () { setPanel('info', false, true); });
        }
        panels.info = {
            el: info,
            btn: infoBtn,
            isOpen: function () { return info.classList.contains('open'); },
            set: function (open) {
                info.classList.toggle('open', open);
                if (open) { refreshToc(); }
            }
        };
        infoBtn.addEventListener('click', function () { setPanel('info', !panels.info.isOpen(), true); });
    }

    // ---------- めくり方の案内(初めて開いたときに一度だけ) ----------
    var hint = document.createElement('div');
    hint.className = 'tap-hint';
    hint.hidden = true;
    book.appendChild(hint);

    function showHint() {
        var v = isVertical();
        hint.innerHTML =
            '<div class="hint-zones" aria-hidden="true">' +
                '<div class="hint-zone"><span class="hint-arrow">‹</span>' + (v ? '次のページ' : '前のページ') + '</div>' +
                '<div class="hint-zone hint-center">メニュー</div>' +
                '<div class="hint-zone">' + (v ? '前のページ' : '次のページ') + '<span class="hint-arrow">›</span></div>' +
            '</div>' +
            '<p class="hint-text" role="status">紙面の左右をタップするとページをめくれます(← → キーでも可)。指で払うと次のページへ進みます(払って戻ることはありません)。' +
                '中央をタップすると、上下のメニューを隠したり出したりできます。<br><b>どこかをタップして読みはじめる</b></p>';
        hint.hidden = false;
    }

    function hideHint() {
        if (hint.hidden) { return false; }
        hint.hidden = true;
        save('hint-seen', '1');
        return true;
    }

    hint.addEventListener('click', function (e) {
        e.stopPropagation();
        hideHint();
    });

    // 紙面の中央をタップすると、上下のバーを隠して紙面を広く使う
    function toggleChrome() {
        body.classList.toggle('immersive');
        layout(true);
    }

    // ---------- 読み終わり(最後のページ) ----------
    var endEl = document.createElement('section');
    endEl.className = 'the-end';
    endEl.innerHTML =
        '<p class="end-mark">(終)</p>' +
        '<p>最後まで読んでいただき、ありがとうございました。</p>' +
        '<p class="end-links">' +
            '<a href="../">書棚へ戻る</a>' +
            (document.getElementById('book-info') ? '<button type="button" id="end-info">解説・訳注を読む</button>' : '') +
            '<button type="button" id="end-top">はじめから読む</button>' +
        '</p>' +
        '<p class="end-note">誤訳のご指摘やご感想は<a href="../contact.html">お問い合わせ</a>からどうぞ。</p>';
    pages.appendChild(endEl);
    var endInfo = document.getElementById('end-info');
    if (endInfo) { endInfo.addEventListener('click', function () { setPanel('info', true); }); }
    document.getElementById('end-top').addEventListener('click', function () { go(0, true); });

    // ---------- 起動 ----------
    root.classList.add('js');
    book.tabIndex = -1;
    buildPanel();
    setupInfo();

    var savedRatio = parseFloat(load(posKey, '0')) || 0;
    layout(false);
    page = Math.round(savedRatio * (total - 1));
    go(page, false);

    if (load('hint-seen', null) !== '1') { showHint(); }

    var modeBtn = document.getElementById('mode');
    if (modeBtn) {
        modeBtn.addEventListener('click', function () {
            settings.mode = isVertical() ? 'horizontal' : 'vertical';
            saveSettings();
            var r = document.querySelector('#settings input[name="mode"][value="' + settings.mode + '"]');
            if (r) { r.checked = true; }
            layout(true);
        });
    }

    document.getElementById('left').addEventListener('click', goLeft);
    document.getElementById('right').addEventListener('click', goRight);

    // 紙面の左右をタップしてめくる。中央はバーの表示・非表示。
    // パネルが開いているときは、まずパネルを閉じるだけにする(裏でページを動かさない)。
    book.addEventListener('click', function (e) {
        if (suppressClick) { suppressClick = false; return; }   // 指でめくった直後のクリックは無視
        if (e.target.closest('a, button')) { return; }
        if (closePanels(true)) { return; }
        var rect = book.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        if (x < 0.4) { goLeft(); }
        else if (x > 0.6) { goRight(); }
        else { toggleChrome(); }
    });

    document.addEventListener('keydown', function (e) {
        var open = openName();
        if (open) {
            if (e.key === 'Escape') { setPanel(open, false, true); e.preventDefault(); return; }
            if (e.key === 'Tab') { trapFocus(panels[open].el, e); return; }
            if (panels[open].el.contains(e.target)) { return; }
        }
        if (hideHint() && e.key === 'Escape') { return; }
        if (e.key === 'Escape' && body.classList.contains('immersive')) { toggleChrome(); return; }
        var t = e.target;
        if (t.closest && t.closest('input, select, textarea')) { return; }
        // ボタンやリンクの上では、スペース・Enter は本来の働き(押す)を優先する
        if (t.closest && t.closest('button, a') && (e.key === ' ' || e.key === 'Enter')) { return; }
        if (e.key === 'ArrowLeft') { goLeft(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { goRight(); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'PageDown') { next(); e.preventDefault(); }
        else if (e.key === 'PageUp') { prev(); e.preventDefault(); }
        else if (e.key === 'Home') { go(0, true); }
        else if (e.key === 'End') { go(total - 1, true); }
    });

    // 進み具合のバーを押すと、その位置へ移動する(縦書きは右端が先頭)
    var progressEl = document.querySelector('.progress');
    if (progressEl) {
        progressEl.setAttribute('aria-hidden', 'true');
        progressEl.title = '押した位置へ移動';
        progressEl.addEventListener('click', function (e) {
            var r = progressEl.getBoundingClientRect();
            var x = (e.clientX - r.left) / r.width;
            if (isVertical()) { x = 1 - x; }
            go(Math.round(Math.max(0, Math.min(1, x)) * (total - 1)), true);
        });
    }

    // マウスホイール・トラックパッドでめくる。
    // 慣性で続くイベントで何ページも進まないよう、止まるまで次をめくらない。
    var wheelLock = 0;
    var wheelAcc = 0;
    book.addEventListener('wheel', function (e) {
        if (e.ctrlKey) { return; }   // ピンチでの拡大は邪魔しない
        e.preventDefault();
        if (openName()) { return; }
        var now = Date.now();
        if (now < wheelLock) {
            wheelLock = Math.max(wheelLock, now + 150);
            return;
        }
        var horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        var d = horiz ? e.deltaX : e.deltaY;
        if (e.deltaMode === 1) { d *= 16; }   // 行単位のホイール
        wheelAcc += d;
        if (Math.abs(wheelAcc) < 30) { return; }
        hideHint();
        if (horiz) {
            if (wheelAcc > 0) { goRight(); } else { goLeft(); }
        } else {
            if (wheelAcc > 0) { next(); } else { prev(); }
        }
        wheelAcc = 0;
        wheelLock = now + 350;
    }, { passive: false });

    // 指(またはペン)で紙の端をつかんでめくる。指で払ってめくれるのは「次のページ」だけ。
    // 前のページへは、紙面の端のタップ・下の矢印ボタン・キーで戻る
    // (払う向きをまちがえて戻ってしまったり、ブラウザの「戻る」操作とまぎれたりしないように)。
    // 指を離したとき、少しでもめくっていれば(紙面の幅の1割ほど)、または軽く払っていれば
    // めくり、引き戻していれば元に戻す。
    // 進む向き:縦書きは指を右へ(左のページを引き寄せる)、横書きは指を左へ。
    var drag = null;
    var suppressClick = false;
    var SWIPE_START = 10;       // これだけ横に動いたら「払った」とみなす(px)
    var SWIPE_DIST = 0.1;       // 紙面の幅に対して、これだけ引けばめくる
    var SWIPE_SPEED = 0.12;     // これより速く払っていれば、距離が足りなくてもめくる(px/ms)
    var SWIPE_BACK = 0.2;       // これより速く引き戻していれば、めくらない(px/ms)

    function forwardSign() { return isVertical() ? 1 : -1; }   // 進む向きの dx の符号

    book.addEventListener('pointerdown', function (e) {
        suppressClick = false;
        if (e.pointerType === 'mouse' || !e.isPrimary) { return; }
        if (e.target.closest && e.target.closest('a, button')) { return; }
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, active: false, done: false, vx: 0, lx: e.clientX, lt: e.timeStamp };
    });

    book.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id || drag.done) { return; }
        var dx = e.clientX - drag.sx;
        var dy = e.clientY - drag.sy;
        var dt = e.timeStamp - drag.lt;
        if (dt > 0) { drag.vx = drag.vx * 0.5 + ((e.clientX - drag.lx) / dt) * 0.5; }
        drag.lx = e.clientX;
        drag.lt = e.timeStamp;
        if (!drag.active) {
            if (Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy)) { return; }
            suppressClick = true;
            if (!drag.dismissed) {
                drag.dismissed = true;
                if (hideHint() || closePanels(false)) { drag.done = true; return; }
            }
            // 戻る向きへ払っても何もしない(そのまま進む向きへ払い直せば、めくりはじめる)
            if (dx * forwardSign() < 0) { return; }
            if (page + 1 > total - 1) { drag.done = true; return; }
            if (reducedMotion()) {
                // 動きを減らす設定のとき:指を離したときにそのまま切りかえる
                drag.done = true;
                drag.instant = true;
                return;
            }
            if (curl) { curlFinish(); }
            var r = book.getBoundingClientRect();
            curlStart(1, drag.sy - r.top < r.height / 2);
            drag.active = true;
            try { book.setPointerCapture(e.pointerId); } catch (err) { /* なくても動く */ }
        }
        var c = curl;
        if (!c) { return; }
        // つかんだところが指についてくる
        var p = curlConstrain(c.cx + dx, c.cy + dy);
        curlRender(p[0], p[1]);
        e.preventDefault();
    });

    function dragEnd(e, cancelled) {
        if (!drag || e.pointerId !== drag.id) { return; }
        var d = drag;
        drag = null;
        var sign = forwardSign();
        if (d.instant) {
            if (!cancelled && (e.clientX - d.sx) * sign > 30) { go(page + 1, true); }
            return;
        }
        if (!d.active || !curl) { return; }
        var c = curl;
        var pulled = Math.abs(c.x - c.cx) / c.w;   // 角を引いた距離(紙面の幅を 1 として)
        var toward = sign * d.vx;                   // めくる向きへの指の速さ(px/ms)
        var commit = !cancelled && toward > -SWIPE_BACK && (pulled > SWIPE_DIST || toward > SWIPE_SPEED);
        var tx = commit ? c.fx : c.cx;
        var remain = Math.abs(tx - c.x) / (2 * c.w);
        curlAnimate(tx, c.cy, 160 + 320 * remain, commit, false);
    }

    book.addEventListener('pointerup', function (e) { dragEnd(e, false); });
    book.addEventListener('pointercancel', function (e) { dragEnd(e, true); });

    var timer = null;
    window.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { layout(true); }, 150);
    });

    // Webフォントの読み込みで行の長さが変わるので、読み込み後に組み直す
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { layout(true); });
    }
})();
