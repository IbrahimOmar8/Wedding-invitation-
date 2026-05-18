/**
 * Pulls the user's recent activity from wish-listy (reservations,
 * friend events, etc.) plus our own WedCard-side activity (new RSVPs,
 * new wishes, new music requests). Merged into a single timeline.
 */
const express = require('express');
const axios = require('axios');
const db = require('../db');
const { authRequired } = require('../auth');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const a = getAccessibleInvitation(req.user.id);
  const local = [];

  if (a) {
    const rsvps = db.prepare(`
      SELECT 'rsvp' AS kind, id, guest_name AS title, attending AS detail, created_at AS at
      FROM rsvps WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 30
    `).all(a.invitation.id);
    const wishes = db.prepare(`
      SELECT 'wish' AS kind, id, guest_name AS title, message AS detail, created_at AS at
      FROM wishes WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 30
    `).all(a.invitation.id);
    const music = db.prepare(`
      SELECT 'music' AS kind, id, guest_name AS title, song AS detail, created_at AS at
      FROM music_requests WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 30
    `).all(a.invitation.id);
    let photos = [];
    try {
      photos = db.prepare(`
        SELECT 'photo' AS kind, id, guest_name AS title, caption AS detail, created_at AS at
        FROM guest_photos WHERE invitation_id = ? ORDER BY created_at DESC LIMIT 30
      `).all(a.invitation.id);
    } catch (_) {}
    local.push(...rsvps, ...wishes, ...music, ...photos);
  }

  // Remote: wish-listy activities
  let remote = [];
  const token = await getWishlistyToken(req.user.id);
  if (token) {
    try {
      const r = await axios.get(`${wl.baseUrl}/api/activities?limit=30`, {
        headers: { Authorization: 'Bearer ' + token }, timeout: 12000,
      });
      const items = r.data?.data?.activities || r.data?.activities || r.data?.data || [];
      remote = items.map(it => ({
        kind: 'wishlisty',
        id: it._id || it.id,
        title: it.actor?.fullName || it.actor?.username || 'Someone',
        detail: it.message || it.type || JSON.stringify(it).slice(0, 100),
        at: it.createdAt || new Date().toISOString(),
      }));
    } catch (_) {}
  }

  const all = [...local, ...remote].sort((a, b) => {
    const ta = new Date((a.at || '').replace(' ', 'T')).getTime() || 0;
    const tb = new Date((b.at || '').replace(' ', 'T')).getTime() || 0;
    return tb - ta;
  }).slice(0, 80);

  res.json({ activities: all });
});

module.exports = router;
