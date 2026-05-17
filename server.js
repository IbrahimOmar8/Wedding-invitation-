require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const db = require('./src/db');
const { parseInvitation } = require('./src/routes/invitation');
const { render } = require('./src/render');

const authRoutes = require('./src/routes/auth');
const invitationRoutes = require('./src/routes/invitation');
const uploadRoutes = require('./src/routes/upload');
const rsvpRoutes = require('./src/routes/rsvp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Static
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/invitation', invitationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/rsvp', rsvpRoutes);

// Themes list
app.get('/api/themes', (req, res) => {
  const dir = path.join(__dirname, 'views', 'themes');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')) : [];
  res.json({ themes: files.map(f => f.replace('.html', '')) });
});

// Public invitation page: /i/:slug
app.get('/i/:slug', (req, res) => {
  const slug = req.params.slug;
  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (!user) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  const row = db.prepare('SELECT * FROM invitations WHERE user_id = ?').get(user.id);
  if (!row || !row.published) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  const invitation = parseInvitation(row);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(render(invitation, slug));
});

// Page routes -> static html in public/
['login', 'signup', 'dashboard'].forEach(page => {
  app.get('/' + page, (req, res) => res.sendFile(path.join(__dirname, 'public', `${page}.html`)));
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// 404 fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Wedding SaaS running on http://localhost:${PORT}`);
});
