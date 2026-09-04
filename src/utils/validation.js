// Shared input-validation helpers.

// Only allow image URLs that cannot smuggle script execution.
function isSafeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return true; // empty = reset to default
    const v = value.trim().toLowerCase();
    return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/');
}

function isSafeText(value, maxLen) {
    return typeof value === 'string' && value.trim().length <= (maxLen || 1000);
}

module.exports = { isSafeImageUrl, isSafeText };