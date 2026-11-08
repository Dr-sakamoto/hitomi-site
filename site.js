/* ===== ほらあな哲学書庫 共通スクリプト =====
 * 外部サービスのIDやURLはここにまとめて書く。空のあいだは何もしない。
 */
var HORAANA_CONFIG = {
    // Cloudflare Web Analytics のトークン(ダッシュボードの「JS Snippet」にある token の値)
    // Cloudflare Pages に移行して自動計測を有効にした場合は空のままでよい。
    cloudflareAnalyticsToken: 'eb7a546d01be4cb5985067653fbe7bee',

    // 問い合わせ用 Google フォームの URL(https://forms.gle/... など)
    contactFormUrl: ''
};

(function () {
    var c = HORAANA_CONFIG;

    // アクセス解析(Cookie を使わない Cloudflare Web Analytics)
    if (c.cloudflareAnalyticsToken) {
        var s = document.createElement('script');
        s.defer = true;
        s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        s.setAttribute('data-cf-beacon', JSON.stringify({ token: c.cloudflareAnalyticsToken }));
        document.head.appendChild(s);
    }

    // 問い合わせフォームへのリンク(data-contact-form をつけた要素)
    function linkForm() {
        if (!c.contactFormUrl) return;
        var els = document.querySelectorAll('[data-contact-form]');
        for (var i = 0; i < els.length; i++) {
            els[i].href = c.contactFormUrl;
            els[i].hidden = false;
        }
        var fallback = document.querySelectorAll('[data-contact-fallback]');
        for (var j = 0; j < fallback.length; j++) fallback[j].hidden = true;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', linkForm);
    } else {
        linkForm();
    }
})();
