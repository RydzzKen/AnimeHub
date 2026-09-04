// ==========================================
// OUTPUT-ESCAPING HELPERS
// Always escape user-controlled data before inserting it into innerHTML
// or into attribute strings. Load this file BEFORE the page's own scripts.
// ==========================================
(function () {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function escapeHtml(value) {
        if (value === undefined || value === null) return '';
        return String(value).replace(/[&<>"']/g, function (c) { return map[c]; });
    }

    // Hanya izinkan URL gambar yang tidak bisa menyelundupkan script/CSS.
    function safeImageUrl(value) {
        if (!value) return null;
        var s = String(value).trim().toLowerCase();
        if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0 || s.indexOf('data:image/') === 0) {
            return String(value).trim();
        }
        return null;
    }

    var bannerFallback = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800';

    function safeBanner(value) {
        return safeImageUrl(value) || bannerFallback;
    }

    window.escapeHtml = escapeHtml;
    window.esc = escapeHtml;
    window.safeImageUrl = safeImageUrl;
    window.safeBanner = safeBanner;
    window.bannerFallback = bannerFallback;
})();