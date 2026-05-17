/**
 * Pull the user's wish-listy friends and let them bulk-add as guests.
 * Read-only proxy + a single mutation endpoint.
 */
const express = require('express');
const axios = require('axios');
const db = require('../db');
const { authRequired } = require('../auth');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');
const { token: randomToken, clamp } = require('../util');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const token = await getWishlistyToken(req.user.id);
  if (!token) return res.json({ friends: [] });
  try {
    const r = await axios.get(`${wl.baseUrl}/api/friends`, {
      headers: { Authorization: 'Bearer ' + token }, timeout: 15000,
    });
    // Various response shapes — normalize
    const friends = r.data?.data?.friends || r.data?.friends || r.data?.data || [];
    res.json({ friends });
  } catch (e) {
    res.status(e?.response?.status || 502).json({ error: e?.response?.data?.message || e.message });
  }
});

router.post('/import', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const friends = Array.isArray(req.body?.friends) ? req.body.friends : [];
  if (!friends.length) return res.status(400).json({ error: 'friends array required' });

  const insert = db.prepare(`INSERT INTO guests (invitation_id, name, token, phone, email, max_guests, note) VALUES (?,?,?,?,?,?,?)`);
  let added = 0;
  for (const f of friends) {
    const name = String(f.fullName || f.name || f.username || '').trim().slice(0, 120);
    if (!name) continue;
    insert.run(inv.id, name, randomToken(10),
      String(f.phone || '').slice(0, 60),
      String(f.email || '').slice(0, 200),
      clamp(2, 1, 20), 'Imported from Wish Listy');
    added++;
  }
  res.json({ added });
});

module.exports = router;
