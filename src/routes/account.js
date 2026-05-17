const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();

router.put('/password', authRequired, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both current and new password required' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, row.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

router.delete('/', authRequired, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required to confirm deletion' });
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.put('/fcm-token', authRequired, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  db.prepare('UPDATE users SET fcm_token = ? WHERE id = ?').run(String(token).slice(0, 4096), req.user.id);
  res.json({ ok: true });
});

router.delete('/fcm-token', authRequired, (req, res) => {
  db.prepare('UPDATE users SET fcm_token = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/stats', authRequired, (req, res) => {
  const inv = db.prepare('SELECT id, view_count FROM invitations WHERE user_id = ?').get(req.user.id);
  if (!inv) return res.json({ stats: {} });
  const guestCount = db.prepare('SELECT COUNT(*) AS n FROM guests WHERE invitation_id = ?').get(inv.id).n;
  const rsvpYes = db.prepare(`SELECT COUNT(*) AS n FROM rsvps WHERE invitation_id = ? AND attending = 'yes'`).get(inv.id).n;
  const rsvpNo = db.prepare(`SELECT COUNT(*) AS n FROM rsvps WHERE invitation_id = ? AND attending = 'no'`).get(inv.id).n;
  const wishesCount = db.prepare('SELECT COUNT(*) AS n FROM wishes WHERE invitation_id = ?').get(inv.id).n;
  res.json({ stats: { views: inv.view_count, guests: guestCount, rsvpYes, rsvpNo, wishes: wishesCount } });
});

module.exports = router;
