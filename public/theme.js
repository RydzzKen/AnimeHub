/* AnimeHub UI 2.0 - Theme Loader
   Reads the user's preferred theme from localStorage 'userSession'
   and applies it to <html data-theme="..."> before the page paints. */
(function () {
    function applyTheme() {
        var theme = 'dark';
        try {
            var us = JSON.parse(localStorage.getItem('userSession') || 'null');
            if (us && (us.theme === 'light' || us.theme === 'dark')) {
                theme = us.theme;
            }
        } catch (e) { /* ignore */ }
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Run as early as possible
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTheme);
    } else {
        applyTheme();
    }

    // Expose helper so pages/settings can switch live & persist
    window.AnimeHubTheme = {
        get: function () {
            return document.documentElement.getAttribute('data-theme') || 'dark';
        },
        set: function (theme, persistUser) {
            theme = (theme === 'light') ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            if (persistUser) {
                try {
                    var us = JSON.parse(localStorage.getItem('userSession') || 'null');
                    if (us) {
                        us.theme = theme;
                        localStorage.setItem('userSession', JSON.stringify(us));
                    }
                } catch (e) { /* ignore */ }
            }
        }
    };
})();
