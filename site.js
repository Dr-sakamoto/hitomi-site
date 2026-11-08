/* ===== ほらあな哲学書庫 共通スクリプト =====
 * 外部サービスのIDはここにまとめて書く。空のあいだは何もしない。
 */
var HORAANA_CONFIG = {
    // Cloudflare Web Analytics のトークン(ダッシュボードの「JS Snippet」にある token の値)
    // Cloudflare Pages に移行して自動計測を有効にした場合は空のままでよい。
    cloudflareAnalyticsToken: 'eb7a546d01be4cb5985067653fbe7bee'
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
})();
