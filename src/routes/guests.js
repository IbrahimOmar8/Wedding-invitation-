const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const { authRequired } = require('../auth');
const { token, clamp } = require('../util');

const router = express.Router();

function getInvitation(userId) {
  return db.prepare('SELECT id FROM invitations WHERE user_id = ?').get(userId);
}

router.get('/', authRequired, (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.json({ guests: [] });
  const guests = db.prepare('SELECT * FROM guests WHERE invitation_id = ? ORDER BY id DESC').all(inv.id);
  res.json({ guests });
});

router.post('/', authRequired, (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const { name, phone, email, max_guests, note } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name required' });
  const t = token(10);
  const info = db.prepare(`INSERT INTO guests (invitation_id, name, token, phone, email, max_guests, note) VALUES (?,?,?,?,?,?,?)`)
    .run(inv.id, String(name).slice(0, 120), t, String(phone || '').slice(0, 60), String(email || '').slice(0, 200), clamp(max_guests || 2, 1, 20), String(note || '').slice(0, 300));
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(info.lastInsertRowid);
  res.json({ guest });
});

router.post('/bulk', authRequired, (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const { names } = req.body || {};
  if (!Array.isArray(names) && typeof names !== 'string') return res.status(400).json({ error: 'names required (array or newline-separated string)' });
  const list = (Array.isArray(names) ? names : String(names).split(/\r?\n/))
    .map(s => String(s).trim()).filter(Boolean).slice(0, 500);
  const stmt = db.prepare(`INSERT INTO guests (invitation_id, name, token, max_guests) VALUES (?,?,?,?)`);
  const inserted = db.transaction(() => list.map(name => {
    const t = token(10);
    stmt.run(inv.id, name.slice(0, 120), t, 2);
    return name;
  }))();
  res.json({ added: inserted.length });
});

router.put('/:id', authRequired, (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  const allowed = ['name', 'phone', 'email', 'max_guests', 'note'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (updates.max_guests !== undefined) updates.max_guests = clamp(updates.max_guests, 1, 20);
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE guests SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...keys.map(k => updates[k]), req.params.id, inv.id);
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  res.json({ guest });
});

router.delete('/:id', authRequired, (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.status(404).json({ error: 'No invitation' });
  db.prepare('DELETE FROM guests WHERE id = ? AND invitation_id = ?').run(req.params.id, inv.id);
  res.json({ ok: true });
});

router.get('/:id/qr', authRequired, async (req, res) => {
  const inv = getInvitation(req.user.id);
  if (!inv) return res.status(404).end();
  const guest = db.prepare('SELECT * FROM guests WHERE id = ? AND invitation_id = ?').get(req.params.id, inv.id);
  if (!guest) return res.status(404).end();
  const user = db.prepare('SELECT slug FROM users WHERE id = ?').get(req.user.id);
  const host = req.protocol + '://' + req.get('host');
  const url = `${host}/i/${user.slug}/g/${guest.token}`;
  try {
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2, color: { dark: '#2d2a24', light: '#ffffff' } });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/qr', authRequired, async (req, res) => {
  const user = db.prepare('SELECT slug FROM users WHERE id = ?').get(req.user.id);
  const host = req.protocol + '://' + req.get('host');
  const url = `${host}/i/${user.slug}`;
  try {
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2, color: { dark: '#2d2a24', light: '#ffffff' } });
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
