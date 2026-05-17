const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

function getInv(userId) {
  return db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(userId);
}

router.get('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.json({ registry: [] });
  const items = db.prepare('SELECT * FROM registry WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(inv.id);
  res.json({ registry: items });
});

router.post('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const { title, url, description, sort_order } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db.prepare(`INSERT INTO registry (invitation_id, title, url, description, sort_order) VALUES (?,?,?,?,?)`)
    .run(inv.id, String(title).slice(0, 120), String(url || '').slice(0, 500),
         String(description || '').slice(0, 300), parseInt(sort_order || 0, 10));
  const item = db.prepare('SELECT * FROM registry WHERE id = ?').get(info.lastInsertRowid);
  res.json({ item });
});

router.put('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const allowed = ['title', 'url', 'description', 'sort_order'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE registry SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...keys.map(k => updates[k]), req.params.id, inv.id);
  const item = db.prepare('SELECT * FROM registry WHERE id = ?').get(req.params.id);
  res.json({ item });
});

router.delete('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  db.prepare('DELETE FROM registry WHERE id = ? AND invitation_id = ?').run(req.params.id, inv.id);
  res.json({ ok: true });
});

module.exports = router;
