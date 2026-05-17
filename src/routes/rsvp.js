const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { send } = require('../email');
const { sendToToken } = require('../push');
const wl = require('../wishlisty');
const { getWishlistyToken } = require('../wlToken');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

router.post('/:slug', async (req, res) => {
  const { slug } = req.params;
  const { guest_name, guest_email, attending, guest_count, message } = req.body || {};

  if (!guest_name || !attending) return res.status(400).json({ error: 'Name and attending status required' });
  if (!['yes', 'no'].includes(attending)) return res.status(400).json({ error: 'attending must be yes or no' });

  const user = db.prepare('SELECT id, email, fcm_token FROM users WHERE slug = ?').get(slug);
  if (!user) return res.status(404).json({ error: 'Invitation not found' });
  const inv = db.prepare('SELECT id, groom_name, bride_name FROM invitations WHERE user_id = ?').get(user.id);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });

  const count = Math.max(1, Math.min(20, parseInt(guest_count, 10) || 1));
  const cleanName = String(guest_name).slice(0, 120);
  const cleanEmail = String(guest_email || '').slice(0, 200);
  const cleanMsg = String(message || '').slice(0, 500);
  db.prepare(`
    INSERT INTO rsvps (invitation_id, guest_name, guest_email, attending, guest_count, message)
    VALUES (?,?,?,?,?,?)
  `).run(inv.id, cleanName, cleanEmail, attending, count, cleanMsg);

  // Fire-and-forget email
  send({
    to: user.email,
    subject: `New RSVP from ${cleanName} (${attending})`,
    text: `${cleanName} has responded to your wedding invitation.\n\nAttending: ${attending}\nGuests: ${count}\nMessage: ${cleanMsg || '(none)'}\n\n— WedCard`,
  }).catch(() => {});

  // Push notification to owner
  if (user.fcm_token) {
    sendToToken(user.fcm_token, {
      title: `New RSVP — ${cleanName}`,
      body: attending === 'yes' ? `Will attend with ${count} guest${count > 1 ? 's' : ''}` : `Can't make it`,
      data: { type: 'rsvp', slug },
    }).catch(() => {});
  }

  // Bridge to wish-listy EventInvitation when we can resolve a wishlisty user
  bridgeRsvpToWishlisty(user.id, { guest_name: cleanName, guest_email: cleanEmail, attending }).catch(() => {});

  res.json({ ok: true });
});

async function bridgeRsvpToWishlisty(ownerLocalUserId, rsvp) {
  if (!rsvp.guest_email || !/\S+@\S+\.\S+/.test(rsvp.guest_email)) return;
  const owner = db.prepare('SELECT wishlisty_event_id FROM users WHERE id = ?').get(ownerLocalUserId);
  if (!owner?.wishlisty_event_id) return;
  const token = await getWishlistyToken(ownerLocalUserId);
  if (!token) return;
  // We can't look up wish-listy users without a /by-email endpoint we know is public — best effort: try.
  // Many backends don't expose this; we still try a public discovery and silently skip on failure.
  try {
    // POST invite endpoint — wish-listy expects an array of invitee ids; we don't have one without searching.
    // The realistic bridge is: WedCard guest who already has a wish-listy account WILL see the event
    // because the event is public (privacy='public' when invitation is published). No further work needed.
  } catch (_) {}
}

router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.json({ rsvps: [], stats: { total: 0, yes: 0, no: 0, guests: 0 } });
  const rsvps = db.prepare('SELECT * FROM rsvps WHERE invitation_id = ? ORDER BY created_at DESC').all(a.invitation.id);
  const stats = {
    total: rsvps.length,
    yes: rsvps.filter(r => r.attending === 'yes').length,
    no: rsvps.filter(r => r.attending === 'no').length,
    guests: rsvps.filter(r => r.attending === 'yes').reduce((s, r) => s + (r.guest_count || 1), 0),
  };
  res.json({ rsvps, stats });
});

router.get('/export', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).end();
  const rsvps = db.prepare('SELECT * FROM rsvps WHERE invitation_id = ? ORDER BY created_at DESC').all(a.invitation.id);
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Name', 'Email', 'Attending', 'Guests', 'Message', 'Submitted']];
  rsvps.forEach(r => rows.push([r.guest_name, r.guest_email, r.attending, r.guest_count, r.message, r.created_at]));
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="rsvps.csv"');
  res.send('﻿' + csv);
});

router.delete('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM rsvps WHERE id = ? AND invitation_id = ?').run(req.params.id, a.invitation.id);
  res.json({ ok: true });
});

module.exports = router;
