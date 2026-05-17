/**
 * Co-host management. The owner can invite another registered user
 * (by email or username) to co-edit their invitation. Cohosts can
 * modify wedding details but cannot transfer ownership or delete
 * the invitation. We resolve cohosts via the cohosts table; access
 * checks in other routes use src/access.js#getAccessibleInvitation.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

function ownerOnly(req, res, next) {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.status(403).json({ error: 'Only the owner can manage cohosts' });
  req.invitation = inv;
  next();
}

router.get('/', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  // Also show invitations the user is a cohost of
  const ownerOf = inv ? db.prepare(`
    SELECT c.id AS cohost_id, c.role, c.created_at, u.id AS user_id, u.email, u.full_name, u.username
    FROM cohosts c JOIN users u ON u.id = c.user_id
    WHERE c.invitation_id = ?
    ORDER BY c.created_at DESC
  `).all(inv.id) : [];
  const cohostOf = db.prepare(`
    SELECT i.id AS invitation_id, i.groom_name, i.bride_name, u.email AS owner_email, u.slug
    FROM cohosts c JOIN invitations i ON i.id = c.invitation_id JOIN users u ON u.id = i.user_id
    WHERE c.user_id = ?
  `).all(req.user.id);
  res.json({ cohosts: ownerOf, cohost_of: cohostOf });
});

router.post('/', authRequired, ownerOnly, (req, res) => {
  const { identifier } = req.body || {};
  if (!identifier) return res.status(400).json({ error: 'Email or username required' });
  const v = String(identifier).trim().toLowerCase();
  const found = db.prepare(`
    SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? OR LOWER(slug) = ?
  `).get(v, v, v);
  if (!found) return res.status(404).json({ error: 'User not found. They need to sign up first.' });
  if (found.id === req.user.id) return res.status(400).json({ error: 'You are already the owner.' });
  try {
    db.prepare('INSERT INTO cohosts (invitation_id, user_id) VALUES (?, ?)').run(req.invitation.id, found.id);
    res.json({ ok: true });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: 'Already a cohost' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authRequired, ownerOnly, (req, res) => {
  db.prepare('DELETE FROM cohosts WHERE id = ? AND invitation_id = ?').run(req.params.id, req.invitation.id);
  res.json({ ok: true });
});

module.exports = router;
