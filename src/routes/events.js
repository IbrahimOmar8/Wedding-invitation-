const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

function getInv(userId) {
  return db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(userId);
}

router.get('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.json({ events: [] });
  const events = db.prepare('SELECT * FROM events WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(inv.id);
  res.json({ events });
});

router.post('/', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const { title, event_date, venue_name, venue_address, map_url, icon, sort_order } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });
  const info = db.prepare(`INSERT INTO events (invitation_id, title, event_date, venue_name, venue_address, map_url, icon, sort_order) VALUES (?,?,?,?,?,?,?,?)`)
    .run(inv.id, String(title).slice(0, 120), event_date || '', String(venue_name || '').slice(0, 160),
         String(venue_address || '').slice(0, 240), String(map_url || '').slice(0, 500),
         String(icon || '').slice(0, 8), parseInt(sort_order || 0, 10));
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  res.json({ event });
});

router.put('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const allowed = ['title', 'event_date', 'venue_name', 'venue_address', 'map_url', 'icon', 'sort_order'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE events SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...keys.map(k => updates[k]), req.params.id, inv.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  res.json({ event });
});

router.delete('/:id', authRequired, (req, res) => {
  const inv = getInv(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  db.prepare('DELETE FROM events WHERE id = ? AND invitation_id = ?').run(req.params.id, inv.id);
  res.json({ ok: true });
});

module.exports = router;
