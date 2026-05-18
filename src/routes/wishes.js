const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { publish } = require('../events');

const router = express.Router();

// Public: submit a wish for an invitation slug
router.post('/:slug', (req, res) => {
  const { slug } = req.params;
  const { guest_name, message } = req.body || {};
  if (!guest_name || !message) return res.status(400).json({ error: 'Name and message required' });

  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (!user) return res.status(404).json({ error: 'Invitation not found' });
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(user.id);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });

  const cleanName = String(guest_name).slice(0, 120);
  const cleanMsg = String(message).slice(0, 500);
  const info = db.prepare('INSERT INTO wishes (invitation_id, guest_name, message, approved) VALUES (?,?,?,1)')
    .run(inv.id, cleanName, cleanMsg);
  publish(inv.id, 'wish', { id: info.lastInsertRowid, guest_name: cleanName, message: cleanMsg });
  res.json({ ok: true });
});

// Authenticated: list wishes for moderation
router.get('/', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.json({ wishes: [] });
  const wishes = db.prepare('SELECT * FROM wishes WHERE invitation_id = ? ORDER BY created_at DESC').all(inv.id);
  res.json({ wishes });
});

router.put('/:id', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const approved = req.body.approved ? 1 : 0;
  db.prepare('UPDATE wishes SET approved = ? WHERE id = ? AND invitation_id = ?').run(approved, req.params.id, inv.id);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM wishes WHERE id = ? AND invitation_id = ?').run(req.params.id, inv.id);
  res.json({ ok: true });
});

module.exports = router;
