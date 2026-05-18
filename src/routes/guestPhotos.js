/**
 * Guest photo wall. Guests upload images post-wedding via the invitation
 * page; the couple moderates (approve/delete) in the dashboard. Uses
 * the same Cloudinary adapter as the main upload route, with local fallback.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { authRequired } = require('../auth');
const { getAccessibleInvitation } = require('../access');
const cloud = require('../cloudinary');

db.exec(`
  CREATE TABLE IF NOT EXISTS guest_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    url TEXT NOT NULL,
    storage TEXT DEFAULT 'local',
    storage_id TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    approved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_guest_photos_invitation ON guest_photos(invitation_id);
`);

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'guest-photos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const slugDir = path.join(UPLOAD_DIR, String(req.params.slug || 'misc').replace(/[^a-z0-9-]/gi, ''));
    if (!fs.existsSync(slugDir)) fs.mkdirSync(slugDir, { recursive: true });
    cb(null, slugDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
});

// Public: guest uploads a photo (auto-approved=false; couple must approve)
router.post('/:slug', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(req.params.slug);
  if (!user) return res.status(404).json({ error: 'Invitation not found' });
  const inv = db.prepare('SELECT id, published FROM invitations WHERE user_id = ?').get(user.id);
  if (!inv?.published) return res.status(404).json({ error: 'Invitation not found' });

  let url = `/uploads/guest-photos/${req.params.slug.replace(/[^a-z0-9-]/gi, '')}/${req.file.filename}`;
  let storageKind = 'local';
  let storageId = req.file.filename;

  if (cloud.isEnabled()) {
    try {
      const r = await cloud.uploadFile(req.file.path, `wedcard/guest-photos/${req.params.slug}`);
      url = r.url; storageKind = 'cloudinary'; storageId = r.public_id;
    } catch (_) {}
  }

  const guest_name = String(req.body?.guest_name || 'Anonymous').slice(0, 120);
  const caption = String(req.body?.caption || '').slice(0, 300);
  db.prepare(`INSERT INTO guest_photos (invitation_id, guest_name, url, storage, storage_id, caption) VALUES (?,?,?,?,?,?)`)
    .run(inv.id, guest_name, url, storageKind, storageId, caption);
  res.json({ ok: true, url, message: 'Thanks! Your photo is pending the couple\'s review.' });
});

// Public: list approved photos for a slug (lightweight feed)
router.get('/:slug', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(req.params.slug);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const inv = db.prepare('SELECT id, published FROM invitations WHERE user_id = ?').get(user.id);
  if (!inv?.published) return res.status(404).json({ error: 'Not found' });
  const photos = db.prepare(`
    SELECT id, guest_name, url, caption, created_at FROM guest_photos
    WHERE invitation_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 100
  `).all(inv.id);
  res.json({ photos });
});

// Admin: list all (including pending), moderate
router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.json({ photos: [] });
  const photos = db.prepare('SELECT * FROM guest_photos WHERE invitation_id = ? ORDER BY created_at DESC').all(a.invitation.id);
  res.json({ photos });
});

router.put('/:id', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const approved = req.body.approved ? 1 : 0;
  db.prepare('UPDATE guest_photos SET approved = ? WHERE id = ? AND invitation_id = ?').run(approved, req.params.id, a.invitation.id);
  res.json({ ok: true });
});

router.delete('/:id', authRequired, async (req, res) => {
  const a = getAccessibleInvitation(req.user.id); if (!a) return res.status(404).json({ error: 'Not found' });
  const photo = db.prepare('SELECT * FROM guest_photos WHERE id = ? AND invitation_id = ?').get(req.params.id, a.invitation.id);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  if (photo.storage === 'cloudinary') {
    await cloud.destroy(photo.storage_id);
  } else if (photo.storage === 'local') {
    const local = path.join(__dirname, '..', '..', photo.url.replace(/^\//, ''));
    if (fs.existsSync(local)) try { fs.unlinkSync(local); } catch (_) {}
  }
  db.prepare('DELETE FROM guest_photos WHERE id = ? AND invitation_id = ?').run(req.params.id, a.invitation.id);
  res.json({ ok: true });
});

module.exports = router;
