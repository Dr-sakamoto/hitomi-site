// ===== ほらあな哲学書庫 ビューワー =====
// 本文(#pages)を CSS 段組みでページに分け、クリック・キー・スワイプでめくる。
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
        ruby: 'first'       // first(初出のみ)| all(すべて)| none(なし)
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

    // ---------- 設定パネル ----------
    function option(value, label, current) {
        return '<option value="' + value + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + label + '</option>';
    }

    function radio(name, value, label, current) {
        return '<label><input type="radio" name="' + name + '" value="' + value + '"' +
            (String(value) === String(current) ? ' checked' : '') + '> ' + label + '</label>';
    }

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
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '読書設定');
        panel.innerHTML =
            '<div class="settings-head"><b>読書設定</b><button type="button" id="settings-close" aria-label="閉じる">×</button></div>' +
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
            '<p class="fit-info" id="fit-info"></p>' +
            '<p class="fit-note">画面に入りきらない行数・文字数を選ぶと、画面に入るぶんだけ表示します。</p>' +
            '<button type="button" id="settings-reset">初期設定に戻す</button>';
        body.appendChild(panel);

        function openPanel(open) {
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        btn.addEventListener('click', function () { openPanel(panel.hidden); });
        document.getElementById('settings-close').addEventListener('click', function () { openPanel(false); btn.focus(); });

        function update(key, value) {
            settings[key] = value;
            saveSettings();
            layout(true);
        }

        panel.addEventListener('change', function (e) {
            var t = e.target;
            if (t.name === 'mode' || t.name === 'font' || t.name === 'theme' || t.name === 'ruby') { update(t.name, t.value); }
            else if (t.id === 'set-lines') { update('lines', parseInt(t.value, 10)); }
            else if (t.id === 'set-chars') { update('chars', parseInt(t.value, 10)); }
            else if (t.id === 'set-lh') { update('lh', parseFloat(t.value)); }
        });

        var fsInput = document.getElementById('set-fs');
        fsInput.addEventListener('input', function () {
            document.getElementById('fs-out').textContent = fsInput.value + 'px';
            update('fs', parseInt(fsInput.value, 10));
        });

        document.getElementById('settings-reset').addEventListener('click', function () {
            for (var k in DEFAULTS) { settings[k] = DEFAULTS[k]; }
            saveSettings();
            panel.remove();
            btn.remove();
            buildPanel();
            layout(true);
            document.getElementById('settings').hidden = false;
        });
    }

    // ---------- この本について(解説・訳注・原典) ----------
    function setupInfo() {
        var info = document.getElementById('book-info');
        var infoBtn = document.getElementById('info-btn');
        if (!info || !infoBtn) { return; }
        function openInfo(open) {
            info.classList.toggle('open', open);
            infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) {
                var sp = document.getElementById('settings');
                if (sp) { sp.hidden = true; }
            }
        }
        infoBtn.addEventListener('click', function () { openInfo(!info.classList.contains('open')); });
        var close = document.getElementById('info-close');
        if (close) { close.addEventListener('click', function () { openInfo(false); infoBtn.focus(); }); }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && info.classList.contains('open')) { openInfo(false); }
        });
        // 設定を開いたら解説は閉じる
        document.addEventListener('click', function (e) {
            if (e.target.id === 'settings-btn') { openInfo(false); }
        });
    }

    // ---------- 起動 ----------
    root.classList.add('js');
    buildPanel();
    setupInfo();

    var savedRatio = parseFloat(load(posKey, '0')) || 0;
    layout(false);
    page = Math.round(savedRatio * (total - 1));
    go(page, false);

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

    // 紙面の左右をタップしてめくる(リンクのクリックは除く)
    book.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) { return; }
        var rect = book.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        if (x < 0.4) { goLeft(); } else if (x > 0.6) { goRight(); }
    });

    document.addEventListener('keydown', function (e) {
        var panelEl = document.getElementById('settings');
        if (e.key === 'Escape' && panelEl && !panelEl.hidden) {
            panelEl.hidden = true;
            return;
        }
        if (panelEl && !panelEl.hidden && e.target.closest && e.target.closest('#settings')) { return; }
        var infoEl = document.getElementById('book-info');
        if (infoEl && infoEl.classList.contains('open') && e.target.closest && e.target.closest('#book-info')) { return; }
        if (e.key === 'ArrowLeft') { goLeft(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { goRight(); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'PageDown') { next(); e.preventDefault(); }
        else if (e.key === 'PageUp') { prev(); e.preventDefault(); }
        else if (e.key === 'Home') { go(0, true); }
        else if (e.key === 'End') { go(total - 1, true); }
    });

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
