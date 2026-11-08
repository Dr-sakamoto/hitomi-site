// ===== ほらあな哲学書庫 ビューワー =====
// 本文(#pages)を CSS 段組みでページに分け、クリック・キー・スワイプでめくる。
// 読書設定(書字方向・文字サイズ・1ページの行数・1行の文字数・行間・書体・背景)と
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
        theme: 'auto'       // auto | paper | white | dark
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
        for (var k in DEFAULTS) { s[k] = stored[k] !== undefined ? stored[k] : DEFAULTS[k]; }
        return s;
    })();

    function saveSettings() { save('settings', JSON.stringify(settings)); }

    var posKey = 'pos:' + location.pathname;

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
        var modeBtn = document.getElementById('mode');
        if (modeBtn) { modeBtn.textContent = isVertical() ? '横書き' : '縦書き'; }
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

    function next() { go(page + 1, true); }
    function prev() { go(page - 1, true); }

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
        // 古いページにある文字サイズボタンは設定パネルにまとめる
        ['smaller', 'larger'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.remove(); }
        });
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
            if (t.name === 'mode' || t.name === 'font' || t.name === 'theme') { update(t.name, t.value); }
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
            '<p class="hint-text" role="status">紙面の左右をタップするか、指で払うとページをめくれます(← → キーでも可)。' +
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

    var touchX = null;
    var touchY = null;
    book.addEventListener('touchstart', function (e) {
        touchX = e.touches[0].clientX;
        touchY = e.touches[0].clientY;
    }, { passive: true });
    book.addEventListener('touchend', function (e) {
        if (touchX === null) { return; }
        var dx = e.changedTouches[0].clientX - touchX;
        var dy = e.changedTouches[0].clientY - touchY;
        touchX = null;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (hideHint()) { return; }
            if (closePanels(false)) { return; }
            // 指を右へ払う = 左のページを引き寄せる
            if (dx > 0) { goLeft(); } else { goRight(); }
        }
    });

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
