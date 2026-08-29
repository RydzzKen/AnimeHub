// ==========================================
// FIX: CSRF PROTECTION (frontend)
// Automatically attaches the CSRF token (from /api/csrf-token) to every
// mutating fetch() request via the x-csrf-token header. This keeps the
// existing API calls working without changing their code.
// ==========================================
(function () {
    var csrfToken = null;
    var tokenPromise = null;

    function getToken() {
        if (csrfToken) return Promise.resolve(csrfToken);
        if (!tokenPromise) {
            tokenPromise = fetch('/api/csrf-token', { credentials: 'same-origin' })
                .then(function (r) { return r.json(); })
                .then(function (d) { csrfToken = d.csrfToken; return csrfToken; })
                .catch(function () { return null; });
        }
        return tokenPromise;
    }

    var origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!origFetch) return;

    window.fetch = function (input, init) {
        init = init || {};
        var method = (init.method || (input && input.method) || 'GET').toUpperCase();

        // GET/HEAD/OPTIONS are not protected by CSRF
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            init.credentials = init.credentials || 'same-origin';
            return origFetch(input, init);
        }

        return getToken().then(function (token) {
            init.headers = init.headers || {};
            var hasHeader = false;
            if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                hasHeader = init.headers.has('x-csrf-token');
                if (token && !hasHeader) init.headers.set('x-csrf-token', token);
            } else {
                if (token && !init.headers['x-csrf-token']) {
                    init.headers['x-csrf-token'] = token;
                }
            }
            init.credentials = init.credentials || 'same-origin';
            return origFetch(input, init);
        });
    };
})();
