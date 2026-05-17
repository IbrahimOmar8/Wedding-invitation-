const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

const EDITABLE_FIELDS = [
  'groom_name', 'bride_name', 'wedding_date',
  'venue_name', 'venue_address', 'map_url',
  'quote', 'presence_text',
  'hero_image', 'theme', 'language', 'published'
];

const VALID_THEMES = new Set(['elegant', 'royal', 'garden']);
const VALID_LANGS = new Set(['en', 'ar']);

function parseInvitation(row) {
  if (!row) return null;
  let gallery = [];
  try { gallery = JSON.parse(row.gallery_images || '[]'); } catch (_) {}
  return { ...row, gallery_images: gallery };
}

router.get('/', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM invitations WHERE user_id = ?').get(req.user.id);
  res.json({ invitation: parseInvitation(row), user: req.user });
});

router.put('/', authRequired, (req, res) => {
  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.theme && !VALID_THEMES.has(updates.theme)) {
    return res.status(400).json({ error: 'Invalid theme' });
  }
  if (updates.language && !VALID_LANGS.has(updates.language)) {
    return res.status(400).json({ error: 'Invalid language' });
  }
  if (updates.published !== undefined) updates.published = updates.published ? 1 : 0;

  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const set = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => updates[k]);
  db.prepare(`UPDATE invitations SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
    .run(...values, req.user.id);

  const row = db.prepare('SELECT * FROM invitations WHERE user_id = ?').get(req.user.id);
  res.json({ invitation: parseInvitation(row) });
});

// Gallery management
router.post('/gallery', authRequired, (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const row = db.prepare('SELECT gallery_images FROM invitations WHERE user_id = ?').get(req.user.id);
  const gallery = JSON.parse(row.gallery_images || '[]');
  if (gallery.length >= 12) return res.status(400).json({ error: 'Gallery limit reached (12 images)' });
  gallery.push(url);
  db.prepare('UPDATE invitations SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(JSON.stringify(gallery), req.user.id);
  res.json({ gallery_images: gallery });
});

router.delete('/gallery', authRequired, (req, res) => {
  const { url } = req.body || {};
  const row = db.prepare('SELECT gallery_images FROM invitations WHERE user_id = ?').get(req.user.id);
  const gallery = JSON.parse(row.gallery_images || '[]').filter(u => u !== url);
  db.prepare('UPDATE invitations SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
    .run(JSON.stringify(gallery), req.user.id);
  res.json({ gallery_images: gallery });
});

module.exports = router;
module.exports.parseInvitation = parseInvitation;
