const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

function getInv(userId) {
  return db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(userId);
}

router.get('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.json({ story: [] });
  const story = db.prepare('SELECT * FROM story WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(inv.id);
  res.json({ story });
});

router.post('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const { title, sub, body, sort_order } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db.prepare(`INSERT INTO story (invitation_id, title, sub, body, sort_order) VALUES (?,?,?,?,?)`)
    .run(inv.id, String(title).slice(0, 120), String(sub || '').slice(0, 80),
         String(body || '').slice(0, 600), parseInt(sort_order || 0, 10));
  const item = db.prepare('SELECT * FROM story WHERE id = ?').get(info.lastInsertRowid);
  res.json({ item });
});

router.put('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const allowed = ['title', 'sub', 'body', 'sort_order'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE story SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...keys.map(k => updates[k]), req.params.id, inv.id);
  const item = db.prepare('SELECT * FROM story WHERE id = ?').get(req.params.id);
  res.json({ item });
});

router.delete('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  db.prepare('DELETE FROM story WHERE id = ? AND invitation_id = ?').run(req.params.id, inv.id);
  res.json({ ok: true });
});

module.exports = router;
