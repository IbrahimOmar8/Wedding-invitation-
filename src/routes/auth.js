const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authRequired } = require('../auth');

const router = express.Router();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['admin', 'api', 'login', 'signup', 'dashboard', 'i', 'uploads', 'public', 'assets']);

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

router.post('/signup', (req, res) => {
  const { email, password } = req.body || {};
  let { slug } = req.body || {};

  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  slug = slugify(slug || email.split('@')[0]);
  if (!slug || !SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug) || slug.length < 3) {
    return res.status(400).json({ error: 'Invalid slug. Use lowercase letters, numbers, and dashes (min 3 chars).' });
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingEmail) return res.status(409).json({ error: 'Email already registered' });

  const existingSlug = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (existingSlug) return res.status(409).json({ error: 'Slug already taken' });

  const hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    const userInfo = db.prepare('INSERT INTO users (email, password_hash, slug) VALUES (?,?,?)').run(email, hash, slug);
    db.prepare('INSERT INTO invitations (user_id) VALUES (?)').run(userInfo.lastInsertRowid);
    return userInfo.lastInsertRowid;
  });

  const id = tx();
  const user = db.prepare('SELECT id, email, slug FROM users WHERE id = ?').get(id);
  const token = sign(user);
  res.json({ token, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const user = { id: row.id, email: row.email, slug: row.slug };
  const token = sign(user);
  res.json({ token, user });
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.get('/check-slug/:slug', (req, res) => {
  const slug = slugify(req.params.slug);
  const available = !!slug && SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) && slug.length >= 3
    && !db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  res.json({ slug, available });
});

module.exports = router;
