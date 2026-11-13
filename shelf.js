// ===== ほらあな哲学書庫 ユーザー別の本棚 =====
// この端末のブラウザ(localStorage)に、プロフィールごとの本棚を記憶する。
// ・プロフィール一覧と現在のプロフィール: horaana:profiles
// ・本棚(読書状態・お気に入り): horaana:shelf:<プロフィールID>
// ・読書位置: reader.js が書く(プロフィール別のキー)
// サーバーには何も送らない。

(function () {
    var ns = 'horaana:';
    var DEFAULT_ID = 'default';
    var STATUSES = ['', 'want', 'reading', 'done'];

    function read(key, fallback) {
        try {
            var v = localStorage.getItem(ns + key);
            return v === null ? fallback : v;
        } catch (e) { return fallback; }
    }
    function write(key, value) {
        try { localStorage.setItem(ns + key, value); } catch (e) { /* 保存できなくても閲覧はできる */ }
    }
    function remove(key) {
        try { localStorage.removeItem(ns + key); } catch (e) { }
    }

    // ---------- プロフィール ----------
    function loadProfiles() {
        var p = null;
        try { p = JSON.parse(read('profiles', 'null')); } catch (e) { p = null; }
        var list = [];
        if (p && Array.isArray(p.list)) {
            for (var i = 0; i < p.list.length; i++) {
                var it = p.list[i];
                if (it && typeof it.id === 'string' && /^[a-z0-9]{1,20}$/.test(it.id) &&
                    typeof it.name === 'string' && it.name) {
                    list.push({ id: it.id, name: it.name.slice(0, 20) });
                }
            }
        }
        if (!list.some(function (x) { return x.id === DEFAULT_ID; })) {
            list.unshift({ id: DEFAULT_ID, name: 'ゲスト' });
        }
        var current = p && typeof p.current === 'string' ? p.current : DEFAULT_ID;
        if (!list.some(function (x) { return x.id === current; })) current = DEFAULT_ID;
        return { current: current, list: list };
    }
    var profiles = loadProfiles();
    function saveProfiles() { write('profiles', JSON.stringify(profiles)); }

    // reader.js と同じ規則(既定のプロフィールは従来のキーのまま)
    function posKey(id, path) {
        return id === DEFAULT_ID ? 'pos:' + path : 'p:' + id + ':pos:' + path;
    }
    function shelfKey(id) { return 'shelf:' + id; }

    function loadShelf(id) {
        var s = {};
        try { s = JSON.parse(read(shelfKey(id), '{}')) || {}; } catch (e) { s = {}; }
        return s;
    }

    // ---------- 画面 ----------
    var bar = document.getElementById('profile-bar');
    var list = document.querySelector('.shelf');
    if (!bar || !list) return;

    var select = document.getElementById('profile-select');
    var filterBtns = bar.querySelectorAll('[data-filter]');
    var FILTERS = ['all', 'reading', 'want', 'done', 'fav'];
    // 前回の絞り込みを覚えておく(この端末だけの便利機能)
    var filter = read('filter', 'all');
    if (FILTERS.indexOf(filter) < 0) filter = 'all';
    var nameInput = document.getElementById('profile-name');
    var continueBox = document.getElementById('continue');
    var continueLink = document.getElementById('continue-link');
    var items = list.querySelectorAll('li[data-book]');
    var emptyMsg = document.getElementById('shelf-empty');

    function currentProfile() {
        for (var i = 0; i < profiles.list.length; i++) {
            if (profiles.list[i].id === profiles.current) return profiles.list[i];
        }
        return profiles.list[0];
    }

    function renderSelect() {
        select.textContent = '';
        profiles.list.forEach(function (p) {
            var o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;
            if (p.id === profiles.current) o.selected = true;
            select.appendChild(o);
        });
        document.getElementById('profile-delete').hidden = profiles.current === DEFAULT_ID;
        document.getElementById('profile-current').textContent = currentProfile().name;
    }

    function ratioOf(path) {
        var r = parseFloat(read(posKey(profiles.current, path), '0'));
        return isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
    }

    // 利用者が選んだ状態を優先し、未設定なら読書位置から推定する
    function effectiveStatus(entry, ratio) {
        if (entry && STATUSES.indexOf(entry.status) > 0) return entry.status;
        if (ratio >= 0.98) return 'done';
        if (ratio > 0) return 'reading';
        return '';
    }

    function renderBooks() {
        var shelf = loadShelf(profiles.current);
        var shown = 0;
        var counts = { all: 0, reading: 0, want: 0, done: 0, fav: 0 };
        var resume = null;   // 「読みかけ」に出す本:最後に開いた読書中の本
        for (var i = 0; i < items.length; i++) {
            var li = items[i];
            var key = li.getAttribute('data-book');
            var entry = shelf[key] || {};
            var ratio = ratioOf(new URL(key, location.href).pathname);
            var status = effectiveStatus(entry, ratio);
            var fav = entry.fav === true;

            var sel = li.querySelector('.status-select');
            sel.value = status;
            var favBtn = li.querySelector('.fav-btn');
            favBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
            favBtn.textContent = fav ? '★' : '☆';
            var pct = Math.round(ratio * 100);
            li.querySelector('.progress-bar').style.setProperty('--p', pct + '%');
            li.querySelector('.progress-text').textContent =
                ratio >= 0.98 ? '最後まで読んだ' : pct > 0 ? pct + '% まで読んだ' : 'まだ開いていない';
            li.querySelector('.book-cover').classList.toggle('is-fav', fav);

            counts.all++;
            if (counts[status] !== undefined) counts[status]++;
            if (fav) counts.fav++;
            if (status === 'reading' && ratio > 0 && ratio < 0.98) {
                var opened = typeof entry.opened === 'number' ? entry.opened : 0;
                if (!resume || opened > resume.opened || (opened === resume.opened && ratio > resume.ratio)) {
                    resume = { li: li, key: key, opened: opened, ratio: ratio };
                }
            }

            var visible = filter === 'all' ||
                (filter === 'fav' ? fav : status === filter);
            li.hidden = !visible;
            if (visible) shown++;
        }
        if (emptyMsg) emptyMsg.hidden = shown !== 0;
        for (var j = 0; j < filterBtns.length; j++) {
            var fk = filterBtns[j].getAttribute('data-filter');
            filterBtns[j].setAttribute('aria-pressed', fk === filter ? 'true' : 'false');
            var c = filterBtns[j].querySelector('.count');
            if (c) c.textContent = counts[fk] ? ' ' + counts[fk] : '';
        }
        if (continueBox) {
            continueBox.hidden = !resume;
            if (resume) {
                continueLink.href = resume.key;
                continueLink.textContent = '「' + resume.li.querySelector('.title').textContent + '」' +
                    Math.round(resume.ratio * 100) + '% から続きを読む';
            }
        }
    }

    function updateEntry(key, patch) {
        var shelf = loadShelf(profiles.current);
        var entry = shelf[key] || {};
        for (var k in patch) entry[k] = patch[k];
        shelf[key] = entry;
        write(shelfKey(profiles.current), JSON.stringify(shelf));
        renderBooks();
    }

    // 各本のコントロール
    for (var i = 0; i < items.length; i++) {
        (function (li) {
            var key = li.getAttribute('data-book');
            li.querySelector('.status-select').addEventListener('change', function (e) {
                var v = e.target.value;
                if (STATUSES.indexOf(v) < 0) return;
                updateEntry(key, { status: v });
            });
            // 最後に開いた本を「読みかけ」に出すため、開いた時刻を記録する
            li.querySelector('.book-cover').addEventListener('click', function () {
                var shelf = loadShelf(profiles.current);
                var entry = shelf[key] || {};
                entry.opened = Date.now();
                shelf[key] = entry;
                write(shelfKey(profiles.current), JSON.stringify(shelf));
            });
            li.querySelector('.fav-btn').addEventListener('click', function () {
                var shelf = loadShelf(profiles.current);
                updateEntry(key, { fav: !(shelf[key] && shelf[key].fav === true) });
            });
        })(items[i]);
    }

    // 絞り込み
    for (var f = 0; f < filterBtns.length; f++) {
        filterBtns[f].addEventListener('click', function (e) {
            filter = e.currentTarget.getAttribute('data-filter');
            write('filter', filter);
            renderBooks();
        });
    }

    // プロフィール操作
    function cleanName(s) {
        return (s || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    }

    select.addEventListener('change', function () {
        var id = select.value;
        if (!profiles.list.some(function (p) { return p.id === id; })) return;
        profiles.current = id;
        saveProfiles();
        renderSelect();
        renderBooks();
    });

    if (continueLink) {
        continueLink.addEventListener('click', function () {
            var key = continueLink.getAttribute('href');
            var shelf = loadShelf(profiles.current);
            var entry = shelf[key] || {};
            entry.opened = Date.now();
            shelf[key] = entry;
            write(shelfKey(profiles.current), JSON.stringify(shelf));
        });
    }

    var showAll = document.getElementById('shelf-show-all');
    if (showAll) {
        showAll.addEventListener('click', function () {
            filter = 'all';
            write('filter', filter);
            renderBooks();
        });
    }

    // 名前の欄が空のときは、欄に戻って入力をうながす
    function nameFromInput() {
        var name = cleanName(nameInput.value);
        if (!name) { nameInput.focus(); return ''; }
        nameInput.value = '';
        return name;
    }

    document.getElementById('profile-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = nameFromInput();
        if (!name) return;
        var id = 'u' + Date.now().toString(36);
        profiles.list.push({ id: id, name: name });
        profiles.current = id;
        saveProfiles();
        renderSelect();
        renderBooks();
    });

    document.getElementById('profile-rename').addEventListener('click', function () {
        var p = currentProfile();
        var name = nameFromInput();
        if (!name) return;
        p.name = name;
        saveProfiles();
        renderSelect();
    });

    document.getElementById('profile-delete').addEventListener('click', function () {
        var p = currentProfile();
        if (p.id === DEFAULT_ID) return;
        if (!window.confirm('「' + p.name + '」の本棚と読書位置を、この端末から削除します。よろしいですか?')) return;
        remove(shelfKey(p.id));
        for (var i = 0; i < items.length; i++) {
            var path = new URL(items[i].getAttribute('data-book'), location.href).pathname;
            remove(posKey(p.id, path));
        }
        profiles.list = profiles.list.filter(function (x) { return x.id !== p.id; });
        profiles.current = DEFAULT_ID;
        saveProfiles();
        renderSelect();
        renderBooks();
    });

    // 読書ページから戻ったときも最新の進捗を出す
    window.addEventListener('pageshow', renderBooks);

    saveProfiles();
    renderSelect();
    renderBooks();
})();
