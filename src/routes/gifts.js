/**
 * Gift tracking. Fetches the linked wishlist's items from wish-listy
 * and merges in our local thank-you flags. Owners and cohosts can
 * toggle "thank you sent" and add a note per item.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const a = getAccessibleInvitation(req.user.id);
  if (!a) return res.json({ items: [], stats: { total: 0, purchased: 0, reserved: 0, thanked: 0 } });

  const owner = db.prepare('SELECT id, wishlisty_wishlist_id FROM users WHERE id = ?').get(a.ownerUserId);
  if (!owner?.wishlisty_wishlist_id) return res.json({ items: [], stats: { total: 0, purchased: 0, reserved: 0, thanked: 0 } });

  const token = await getWishlistyToken(a.ownerUserId);
  if (!token) return res.json({ items: [], stats: { total: 0, purchased: 0, reserved: 0, thanked: 0 } });

  try {
    const result = await wl.getWishlist(token, owner.wishlisty_wishlist_id);
    const wishlist = result?.data?.wishlist || result?.wishlist || result?.data || result;
    const items = wishlist?.items || [];

    const notes = db.prepare('SELECT * FROM gift_notes WHERE invitation_id = ?').all(a.invitation.id);
    const noteMap = new Map(notes.map(n => [n.wishlisty_item_id, n]));

    const enriched = items.map(it => {
      const id = String(it._id || it.id);
      const n = noteMap.get(id) || {};
      return {
        id,
        name: it.name,
        description: it.description,
        image: it.image,
        isPurchased: !!it.isPurchased,
        reservedUntil: it.reservedUntil,
        priority: it.priority,
        thank_you_sent: !!n.thank_you_sent,
        note: n.note || '',
      };
    });

    const stats = {
      total: enriched.length,
      purchased: enriched.filter(i => i.isPurchased).length,
      reserved: enriched.filter(i => i.reservedUntil && !i.isPurchased).length,
      thanked: enriched.filter(i => i.thank_you_sent).length,
    };
    res.json({ items: enriched, stats });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

router.put('/:itemId', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const { thank_you_sent, note } = req.body || {};
  const existing = db.prepare('SELECT * FROM gift_notes WHERE invitation_id = ? AND wishlisty_item_id = ?').get(a.invitation.id, req.params.itemId);
  if (existing) {
    db.prepare(`UPDATE gift_notes SET thank_you_sent = ?, note = ?, updated_at = CURRENT_TIMESTAMP
                WHERE invitation_id = ? AND wishlisty_item_id = ?`)
      .run(thank_you_sent ? 1 : 0, String(note || '').slice(0, 500), a.invitation.id, req.params.itemId);
  } else {
    db.prepare(`INSERT INTO gift_notes (invitation_id, wishlisty_item_id, thank_you_sent, note) VALUES (?,?,?,?)`)
      .run(a.invitation.id, req.params.itemId, thank_you_sent ? 1 : 0, String(note || '').slice(0, 500));
  }
  res.json({ ok: true });
});

module.exports = router;
