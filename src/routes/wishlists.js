/**
 * Proxy endpoints that forward to wish-listy on behalf of the logged-in
 * WedCard user. The wish-listy JWT is fetched via wlToken (refreshing
 * automatically if needed) and is never sent to the browser.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');

const router = express.Router();

async function withToken(req, res) {
  const token = await getWishlistyToken(req.user.id);
  if (!token) { res.status(412).json({ error: 'Wish Listy account not connected. Please sign in via Wish Listy.' }); return null; }
  return token;
}

// List the user's wish-listy wishlists
router.get('/', authRequired, async (req, res) => {
  const token = await withToken(req, res); if (!token) return;
  try {
    const data = await wl.listWishlists(token);
    res.json(data);
  } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

router.get('/:id', authRequired, async (req, res) => {
  const token = await withToken(req, res); if (!token) return;
  try { res.json(await wl.getWishlist(token, req.params.id)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

router.post('/', authRequired, async (req, res) => {
  const token = await withToken(req, res); if (!token) return;
  try { res.json(await wl.createWishlist(token, req.body)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

// Select an existing wishlist as the wedding registry
router.post('/select', authRequired, async (req, res) => {
  const token = await withToken(req, res); if (!token) return;
  const { wishlist_id } = req.body || {};
  if (!wishlist_id) return res.status(400).json({ error: 'wishlist_id required' });
  try {
    // Verify it exists and belongs to this user before storing
    await wl.getWishlist(token, wishlist_id);
    db.prepare('UPDATE users SET wishlisty_wishlist_id = ? WHERE id = ?').run(String(wishlist_id), req.user.id);

    // If the user already has a linked wish-listy Event, link the wishlist to it too
    const u = db.prepare('SELECT wishlisty_event_id FROM users WHERE id = ?').get(req.user.id);
    if (u?.wishlisty_event_id) {
      try { await wl.linkWishlistToEvent(token, u.wishlisty_event_id, wishlist_id); } catch (_) {}
    }
    res.json({ ok: true, wishlist_id });
  } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
});

router.post('/disconnect', authRequired, (req, res) => {
  db.prepare('UPDATE users SET wishlisty_wishlist_id = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// Health check for the dashboard banner
router.get('/_status', authRequired, async (req, res) => {
  const u = db.prepare('SELECT wishlisty_user_id, wishlisty_wishlist_id, wishlisty_event_id FROM users WHERE id = ?').get(req.user.id);
  const token = await getWishlistyToken(req.user.id);
  res.json({
    connected: !!u?.wishlisty_user_id,
    has_token: !!token,
    has_wishlist: !!u?.wishlisty_wishlist_id,
    has_event: !!u?.wishlisty_event_id,
    base_url: wl.baseUrl,
  });
});

module.exports = router;
