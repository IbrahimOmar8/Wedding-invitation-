const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

const EDITABLE_FIELDS = [
  'groom_name', 'bride_name', 'wedding_date',
  'venue_name', 'venue_address', 'map_url',
  'quote', 'presence_text',
  'hero_image', 'theme', 'language', 'published',
  'livestream_url', 'music_url', 'accent_color', 'og_image', 'save_the_date_only',
];

const VALID_THEMES = new Set(['elegant', 'royal', 'garden', 'minimal', 'rustic', 'beach']);
const VALID_LANGS = new Set(['en', 'ar']);
const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/;

function parseInvitation(row) {
  if (!row) return null;
  let gallery = [];
  try { gallery = JSON.parse(row.gallery_images || '[]'); } catch (_) {}
  return { ...row, gallery_images: gallery };
}

router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id);
  if (!a) return res.json({ invitation: null, user: req.user });
  res.json({ invitation: parseInvitation(a.invitation), user: req.user, role: a.role, ownerUserId: a.ownerUserId });
});

router.put('/', authRequired, async (req, res) => {
  const a = getAccessibleInvitation(req.user.id);
  if (!a) return res.status(403).json({ error: 'No invitation accessible' });

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.theme && !VALID_THEMES.has(updates.theme)) return res.status(400).json({ error: 'Invalid theme' });
  if (updates.language && !VALID_LANGS.has(updates.language)) return res.status(400).json({ error: 'Invalid language' });
  if (updates.accent_color !== undefined) {
    const v = String(updates.accent_color).trim();
    if (v && !HEX_RE.test(v)) return res.status(400).json({ error: 'accent_color must be a hex value like #b78a3a' });
    updates.accent_color = v ? (v.startsWith('#') ? v : '#' + v) : '';
  }
  if (updates.published !== undefined) updates.published = updates.published ? 1 : 0;
  if (updates.save_the_date_only !== undefined) updates.save_the_date_only = updates.save_the_date_only ? 1 : 0;

  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE invitations SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map(k => updates[k]), a.invitation.id);

  const row = db.prepare('SELECT * FROM invitations WHERE id = ?').get(a.invitation.id);

  syncEventToWishlisty(a.ownerUserId, row).catch(e => {
    console.error('[wishlisty.event.sync]', e.status || '', e.message);
  });

  res.json({ invitation: parseInvitation(row) });
});

router.post('/gallery', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(403).json({ error: 'No invitation' });
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  const gallery = JSON.parse(a.invitation.gallery_images || '[]');
  if (gallery.length >= 12) return res.status(400).json({ error: 'Gallery limit reached (12 images)' });
  gallery.push(url);
  db.prepare('UPDATE invitations SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(gallery), a.invitation.id);
  res.json({ gallery_images: gallery });
});

router.delete('/gallery', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(403).json({ error: 'No invitation' });
  const { url } = req.body || {};
  const gallery = JSON.parse(a.invitation.gallery_images || '[]').filter(u => u !== url);
  db.prepare('UPDATE invitations SET gallery_images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(gallery), a.invitation.id);
  res.json({ gallery_images: gallery });
});

async function syncEventToWishlisty(userId, invitation) {
  if (!invitation) return;
  const u = db.prepare('SELECT wishlisty_user_id, wishlisty_event_id, wishlisty_wishlist_id FROM users WHERE id = ?').get(userId);
  if (!u?.wishlisty_user_id) return;
  const token = await getWishlistyToken(userId);
  if (!token) return;

  const d = new Date(invitation.wedding_date || Date.now());
  if (isNaN(d.getTime())) return;
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

  const payload = {
    name: `${invitation.groom_name || ''} & ${invitation.bride_name || ''} Wedding`.trim(),
    description: invitation.quote || '',
    date, time, type: 'wedding',
    privacy: invitation.published ? 'public' : 'private',
    mode: 'in_person',
    location: [invitation.venue_name, invitation.venue_address].filter(Boolean).join(' — ') || 'TBD',
  };

  if (u.wishlisty_event_id) {
    await wl.updateEvent(token, u.wishlisty_event_id, payload);
  } else {
    const result = await wl.createEvent(token, payload);
    const eventId = result?.data?.id || result?.data?._id || result?.data?.event?._id || result?.data?.event?.id || result?.event?._id || result?.event?.id;
    if (eventId) {
      db.prepare('UPDATE users SET wishlisty_event_id = ? WHERE id = ?').run(String(eventId), userId);
      if (u.wishlisty_wishlist_id) {
        try { await wl.linkWishlistToEvent(token, eventId, u.wishlisty_wishlist_id); } catch (_) {}
      }
    }
  }
}

module.exports = router;
module.exports.parseInvitation = parseInvitation;
