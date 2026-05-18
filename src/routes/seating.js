/**
 * Seating chart. The couple defines tables with a capacity, then assigns
 * each guest to a table. Guests can see their assigned table via the
 * personalized invitation link.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { getAccessibleInvitation } = require('../access');

db.exec(`
  CREATE TABLE IF NOT EXISTS seating_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER DEFAULT 8,
    note TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_seating_tables_invitation ON seating_tables(invitation_id);

  -- Add table assignment column to existing guests table
`);

// Add table_id to guests table if not present
const guestCols = db.prepare('PRAGMA table_info(guests)').all().map(c => c.name);
if (!guestCols.includes('seating_table_id')) {
  db.exec('ALTER TABLE guests ADD COLUMN seating_table_id INTEGER REFERENCES seating_tables(id) ON DELETE SET NULL');
}

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.json({ tables: [], guests: [] });
  const tables = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM guests WHERE seating_table_id = t.id) AS assigned
    FROM seating_tables t WHERE t.invitation_id = ?
    ORDER BY t.sort_order ASC, t.id ASC
  `).all(a.invitation.id);
  const guests = db.prepare('SELECT id, name, seating_table_id, max_guests FROM guests WHERE invitation_id = ? ORDER BY name').all(a.invitation.id);
  res.json({ tables, guests });
});

router.post('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const { name, capacity, note, sort_order } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const info = db.prepare(`INSERT INTO seating_tables (invitation_id, name, capacity, note, sort_order) VALUES (?,?,?,?,?)`)
    .run(a.invitation.id, String(name).slice(0, 80), Math.max(1, Math.min(50, parseInt(capacity, 10) || 8)),
         String(note || '').slice(0, 200), parseInt(sort_order || 0, 10));
  res.json({ table: db.prepare('SELECT * FROM seating_tables WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name', 'capacity', 'note', 'sort_order'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (updates.capacity !== undefined) updates.capacity = Math.max(1, Math.min(50, parseInt(updates.capacity, 10) || 8));
  const keys = Object.keys(updates);
  if (!keys.length) return res.status(400).json({ error: 'No fields to update' });
  const set = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE seating_tables SET ${set} WHERE id = ? AND invitation_id = ?`)
    .run(...keys.map(k => updates[k]), req.params.id, a.invitation.id);
  res.json({ table: db.prepare('SELECT * FROM seating_tables WHERE id = ?').get(req.params.id) });
});

router.delete('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM seating_tables WHERE id = ? AND invitation_id = ?').run(req.params.id, a.invitation.id);
  res.json({ ok: true });
});

// Assign a guest to a table
router.put('/assign/:guestId', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const { table_id } = req.body || {};
  // Verify table belongs to this invitation (or null to unassign)
  if (table_id) {
    const t = db.prepare('SELECT id, capacity FROM seating_tables WHERE id = ? AND invitation_id = ?').get(table_id, a.invitation.id);
    if (!t) return res.status(404).json({ error: 'Table not found' });
    const assigned = db.prepare('SELECT COUNT(*) AS n FROM guests WHERE seating_table_id = ?').get(table_id).n;
    if (assigned >= t.capacity) return res.status(400).json({ error: 'Table is full' });
  }
  db.prepare('UPDATE guests SET seating_table_id = ? WHERE id = ? AND invitation_id = ?')
    .run(table_id || null, req.params.guestId, a.invitation.id);
  res.json({ ok: true });
});

module.exports = router;
