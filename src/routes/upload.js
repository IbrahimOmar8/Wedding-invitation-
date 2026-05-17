const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authRequired } = require('../auth');
const cloud = require('../cloudinary');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOAD_DIR, String(req.user.id));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '').slice(0, 40);
    const name = `${Date.now()}-${base || 'img'}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPG, PNG, WEBP, GIF allowed'), ok);
  },
});

router.post('/', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (cloud.isEnabled()) {
    try {
      const r = await cloud.uploadFile(req.file.path, `wedcard/${req.user.id}`);
      return res.json({ url: r.url, filename: r.public_id, storage: 'cloudinary' });
    } catch (e) {
      console.warn('[upload] cloudinary failed, falling back to local:', e.message);
    }
  }

  const url = `/uploads/${req.user.id}/${req.file.filename}`;
  res.json({ url, filename: req.file.filename, storage: 'local' });
});

router.delete('/:filename', authRequired, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, String(req.user.id), safe);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

module.exports = router;
