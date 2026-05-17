/**
 * Song-request feature. Guests submit a track from the invitation page;
 * the couple/DJ moderate the queue in the dashboard.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { getAccessibleInvitation } = require('../access');

// Ensure the table exists. We co-locate this with the route rather than
// touching src/db.js because it's a self-contained feature.
db.exec(`
  CREATE TABLE IF NOT EXISTS music_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    song TEXT NOT NULL,
    artist TEXT DEFAULT '',
    note TEXT DEFAULT '',
    approved INTEGER DEFAULT 1,
    played INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_music_requests_invitation ON music_requests(invitation_id);
`);

const router = express.Router();

router.post('/:slug', (req, res) => {
  const { guest_name, song, artist, note } = req.body || {};
  if (!guest_name || !song) return res.status(400).json({ error: 'guest_name and song required' });
  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(req.params.slug);
  if (!user) return res.status(404).json({ error: 'Invitation not found' });
  const inv = db.prepare('SELECT id, published FROM invitations WHERE user_id = ?').get(user.id);
  if (!inv?.published) return res.status(404).json({ error: 'Invitation not found' });
  db.prepare(`INSERT INTO music_requests (invitation_id, guest_name, song, artist, note) VALUES (?,?,?,?,?)`)
    .run(inv.id, String(guest_name).slice(0, 120), String(song).slice(0, 200), String(artist || '').slice(0, 160), String(note || '').slice(0, 300));
  res.json({ ok: true });
});

router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.json({ requests: [] });
  const requests = db.prepare('SELECT * FROM music_requests WHERE invitation_id = ? ORDER BY created_at DESC').all(a.invitation.id);
  res.json({ requests });
});

router.put('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  if (typeof req.body.approved !== 'undefined') updates.approved = req.body.approved ? 1 : 0;
  if (typeof req.body.played !== 'undefined') updates.played = req.body.played ? 1 : 0;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
  const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE music_requests SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...Object.values(updates), req.params.id, a.invitation.id);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM music_requests WHERE id = ? AND invitation_id = ?').run(req.params.id, a.invitation.id);
  res.json({ ok: true });
});

router.get('/export', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).end();
  const reqs = db.prepare('SELECT * FROM music_requests WHERE invitation_id = ? AND approved = 1 ORDER BY created_at ASC').all(a.invitation.id);
  const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Song', 'Artist', 'Requested by', 'Note', 'Played', 'When']];
  reqs.forEach(r => rows.push([r.song, r.artist, r.guest_name, r.note, r.played ? 'yes' : 'no', r.created_at]));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="songs.csv"');
  res.send('﻿' + rows.map(r => r.map(esc).join(',')).join('\n'));
});

module.exports = router;
