const crypto = require('crypto');

function token(len = 10) {
  return crypto.randomBytes(16).toString('base64url').slice(0, len);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(v)) return v;
  return '';
}

function clamp(n, min, max) {
  const x = parseInt(n, 10);
  return isNaN(x) ? min : Math.max(min, Math.min(max, x));
}

module.exports = { token, escapeHtml, safeUrl, clamp };
