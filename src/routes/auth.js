const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth');
const wl = require('../wishlisty');
const { encrypt } = require('../crypto');

const router = express.Router();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 'signup', 'dashboard', 'i', 'uploads', 'public', 'assets', 'verify-otp']);

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function isValidSlug(slug) {
  return slug && SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) && slug.length >= 3 && slug.length <= 40;
}

function storeTokens(userId, accessToken, refreshToken) {
  const expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString(); // refresh slightly before 1h
  db.prepare('UPDATE users SET wishlisty_access_token=?, wishlisty_refresh_token=?, wishlisty_token_expires_at=? WHERE id=?')
    .run(encrypt(accessToken), encrypt(refreshToken || ''), expiresAt, userId);
}

router.get('/check-slug/:slug', (req, res) => {
  const slug = slugify(req.params.slug);
  const available = isValidSlug(slug) && !db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  res.json({ slug, available });
});

/**
 * POST /api/auth/signup
 * Body: { fullName, username (email or phone), password, slug, country_code? }
 *
 * Proxies registration to wish-listy. We do NOT create the local user
 * record yet — that happens only after OTP verification, when we have
 * a confirmed wish-listy user_id and tokens.
 */
router.post('/signup', async (req, res) => {
  const { fullName, username, password, country_code } = req.body || {};
  let { slug } = req.body || {};

  if (!fullName || !username || !password) return res.status(400).json({ error: 'fullName, username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  slug = slugify(slug || username.split('@')[0] || username);
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, and dashes (min 3, max 40 chars).' });

  const existingSlug = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (existingSlug) return res.status(409).json({ error: 'Slug already taken' });

  try {
    const result = await wl.register({ fullName, username, password, country_code });
    res.json({
      ok: true,
      requiresOtp: true,
      username,
      country_code: country_code || '',
      slug,
      verificationMethod: result.verificationMethod || 'email',
      message: result.message || 'Verification code sent.',
    });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { username, otp, slug, password, country_code? }
 *
 * After OTP success, wish-listy returns a JWT + refresh token. We then
 * create (or fuse with) a local user row and return our own WedCard JWT.
 */
router.post('/verify-otp', async (req, res) => {
  const { username, otp, slug, password, country_code } = req.body || {};
  if (!username || !otp || !slug) return res.status(400).json({ error: 'username, otp, slug required' });
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });

  try {
    const result = await wl.verifyOTP({ username, otp, country_code });
    if (!result.token) return res.status(400).json({ error: 'Verification failed' });

    const wishlistyUserId = result.user?.id || result.user?._id;
    const passHash = password ? bcrypt.hashSync(password, 10) : null;

    // Create or update local row keyed by wishlisty_user_id
    let local = db.prepare('SELECT * FROM users WHERE wishlisty_user_id = ?').get(String(wishlistyUserId));
    if (!local) {
      // Avoid slug collisions a second time
      const taken = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
      if (taken) return res.status(409).json({ error: 'Slug already taken' });
      const info = db.prepare(`
        INSERT INTO users (slug, full_name, username, email, password_hash, country_code, wishlisty_user_id)
        VALUES (?,?,?,?,?,?,?)
      `).run(slug, result.user?.fullName || '', username, /\S+@\S+\.\S+/.test(username) ? username.toLowerCase() : null,
             passHash, country_code || '', String(wishlistyUserId));
      db.prepare('INSERT INTO invitations (user_id) VALUES (?)').run(info.lastInsertRowid);
      local = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    storeTokens(local.id, result.token, result.refreshToken);

    const user = { id: local.id, email: local.email, slug: local.slug, full_name: local.full_name };
    res.json({ token: sign(user), user });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.post('/resend-otp', async (req, res) => {
  const { username, country_code } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  try { const r = await wl.resendOTP({ username, country_code }); res.json(r); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

/**
 * POST /api/auth/login
 * Body: { username, password, country_code? }
 *
 * Logs in via wish-listy and refreshes our stored tokens. We rely on
 * wish-listy as the source of truth for credentials.
 */
router.post('/login', async (req, res) => {
  const { username, password, country_code } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  try {
    const result = await wl.login({ username, password, country_code });
    if (!result.token) return res.status(401).json({ error: 'Invalid credentials' });
    const wishlistyUserId = String(result.user?.id || result.user?._id);

    let local = db.prepare('SELECT * FROM users WHERE wishlisty_user_id = ?').get(wishlistyUserId);
    if (!local) {
      // First login from a wish-listy account that never registered through WedCard.
      // Auto-provision a local row with a fresh slug derived from username.
      let base = slugify(result.user?.handle || result.user?.username || username.split('@')[0] || 'user');
      if (!isValidSlug(base)) base = 'user-' + wishlistyUserId.slice(-6);
      let candidate = base;
      let i = 1;
      while (db.prepare('SELECT id FROM users WHERE slug = ?').get(candidate)) { candidate = `${base}-${i++}`; if (i > 999) break; }
      const info = db.prepare(`
        INSERT INTO users (slug, full_name, username, email, country_code, wishlisty_user_id)
        VALUES (?,?,?,?,?,?)
      `).run(candidate, result.user?.fullName || '', username, /\S+@\S+\.\S+/.test(username) ? username.toLowerCase() : null,
             country_code || '', wishlistyUserId);
      db.prepare('INSERT INTO invitations (user_id) VALUES (?)').run(info.lastInsertRowid);
      local = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    storeTokens(local.id, result.token, result.refreshToken);

    const user = { id: local.id, email: local.email, slug: local.slug, full_name: local.full_name };
    res.json({ token: sign(user), user });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

router.get('/me', authRequired, (req, res) => {
  const local = db.prepare('SELECT id, email, slug, full_name, username, wishlisty_user_id, wishlisty_event_id, wishlisty_wishlist_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: local });
});

module.exports = router;
