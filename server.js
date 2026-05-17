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
const guestsRoutes = require('./src/routes/guests');
const wishesRoutes = require('./src/routes/wishes');
const eventsRoutes = require('./src/routes/events');
const storyRoutes = require('./src/routes/story');
const registryRoutes = require('./src/routes/registry');
const accountRoutes = require('./src/routes/account');
const wishlistsRoutes = require('./src/routes/wishlists');
const cohostRoutes = require('./src/routes/cohost');
const giftsRoutes = require('./src/routes/gifts');
const analyticsRoutes = require('./src/routes/analytics');
const cronJobs = require('./src/cron');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/invitation', invitationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/rsvp', rsvpRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/wishes', wishesRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/story', storyRoutes);
app.use('/api/registry', registryRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/wishlisty', wishlistsRoutes);
app.use('/api/cohosts', cohostRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/themes', (req, res) => {
  const dir = path.join(__dirname, 'views', 'themes');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')) : [];
  res.json({ themes: files.map(f => f.replace('.html', '')) });
});

async function renderInvitation(slug, guestToken, res) {
  const user = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (!user) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  const row = db.prepare('SELECT * FROM invitations WHERE user_id = ?').get(user.id);
  if (!row || !row.published) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));

  let guest = null;
  if (guestToken) {
    guest = db.prepare('SELECT * FROM guests WHERE token = ? AND invitation_id = ?').get(guestToken, row.id);
  }

  try {
    db.prepare('UPDATE invitations SET view_count = view_count + 1 WHERE id = ?').run(row.id);
    const ip = (res.req.headers['x-forwarded-for'] || res.req.socket.remoteAddress || '').split(',')[0].trim();
    const geo = ip && geoip.lookup(ip);
    const country = geo?.country || '';
    db.prepare('INSERT INTO page_views (invitation_id, country, referer, user_agent) VALUES (?,?,?,?)')
      .run(row.id, country, String(res.req.headers.referer || '').slice(0, 300), String(res.req.headers['user-agent'] || '').slice(0, 300));
  } catch (_) {}

  const invitation = parseInvitation(row);
  try {
    const html = await render(invitation, slug, guest);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('Render error:', e.message);
    res.status(500).send('Failed to render invitation');
  }
}

app.get('/i/:slug', (req, res) => renderInvitation(req.params.slug, null, res));
app.get('/i/:slug/g/:token', (req, res) => renderInvitation(req.params.slug, req.params.token, res));

['login', 'signup', 'dashboard', 'verify-otp'].forEach(page => {
  app.get('/' + page, (req, res) => res.sendFile(path.join(__dirname, 'public', `${page}.html`)));
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Wedding SaaS running on http://localhost:${PORT}`);
  if (process.env.DISABLE_CRON !== '1') cronJobs.start();
});
