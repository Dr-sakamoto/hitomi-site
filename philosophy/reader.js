// ===== ほらあな哲学書庫 ビューワー =====
// 本文(#pages)を CSS 段組みでページに分け、クリック・キー・スワイプでめくる。
// 縦書き/横書き、文字サイズ、読んでいた位置はブラウザに記憶する。

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

    var vertical = load('mode', 'vertical') === 'vertical';
    var fontSize = parseInt(load('fs', '18'), 10) || 18;
    var posKey = 'pos:' + location.pathname;

    function isVertical() { return vertical; }

    function pageSize() {
        return isVertical() ? pages.clientHeight : pages.clientWidth;
    }

    function layout(keepRatio) {
        var ratio = total > 1 ? page / (total - 1) : 0;
        body.classList.toggle('vertical', vertical);
        root.style.setProperty('--fs', fontSize + 'px');
        pages.style.columnWidth = 'auto';
        pages.style.columnGap = GAP + 'px';
        // 1段の幅(縦書きなら高さ)を紙面と同じにする → 1段 = 1ページ
        var size = pageSize();
        pages.style.columnWidth = size + 'px';
        var scrollSize = isVertical() ? pages.scrollHeight : pages.scrollWidth;
        total = Math.max(1, Math.round((scrollSize + GAP) / (size + GAP)));
        if (keepRatio) {
            page = Math.round(ratio * (total - 1));
        }
        go(page, false);
        document.getElementById('mode').textContent = vertical ? '横書き' : '縦書き';
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

    root.classList.add('js');

    // 保存された位置から再開
    var savedRatio = parseFloat(load(posKey, '0')) || 0;
    layout(false);
    page = Math.round(savedRatio * (total - 1));
    go(page, false);

    document.getElementById('left').addEventListener('click', goLeft);
    document.getElementById('right').addEventListener('click', goRight);

    document.getElementById('mode').addEventListener('click', function () {
        vertical = !vertical;
        save('mode', vertical ? 'vertical' : 'horizontal');
        layout(true);
    });

    document.getElementById('smaller').addEventListener('click', function () {
        fontSize = Math.max(14, fontSize - 2);
        save('fs', String(fontSize));
        layout(true);
    });

    document.getElementById('larger').addEventListener('click', function () {
        fontSize = Math.min(28, fontSize + 2);
        save('fs', String(fontSize));
        layout(true);
    });

    // 紙面の左右をタップしてめくる(リンクのクリックは除く)
    book.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) { return; }
        var rect = book.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width;
        if (x < 0.4) { goLeft(); } else if (x > 0.6) { goRight(); }
    });

    document.addEventListener('keydown', function (e) {
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
