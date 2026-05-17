require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const db = require('./src/db');
const { parseInvitation } = require('./src/routes/invitation');
const { render } = require('./src/render');
const security = require('./src/security');
const logger = require('./src/logger');

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
const publicReserveRoutes = require('./src/routes/publicReserve');
const musicRoutes = require('./src/routes/music');
const friendsRoutes = require('./src/routes/friends');
const cronJobs = require('./src/cron');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust X-Forwarded-* on Render / Heroku / behind nginx so req.ip + rate limiting work
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(security.helmetMiddleware);
app.use(security.corsMiddleware());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Bucketed rate limits — auth gets the strictest budget
app.use('/api/auth', security.authLimiter, authRoutes);

// Public POSTs (RSVPs + wishes from guests) get a per-IP burst limit
app.use('/api/rsvp', (req, res, next) => req.method === 'POST' ? security.publicWriteLimiter(req, res, next) : next(), rsvpRoutes);
app.use('/api/wishes', (req, res, next) => req.method === 'POST' ? security.publicWriteLimiter(req, res, next) : next(), wishesRoutes);

// Everything else under /api/ shares the general API limiter
app.use('/api', security.apiLimiter);

app.use('/api/invitation', invitationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/story', storyRoutes);
app.use('/api/registry', registryRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/wishlisty', wishlistsRoutes);
app.use('/api/cohosts', cohostRoutes);
app.use('/api/gifts', giftsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/public/reserve', security.publicWriteLimiter, publicReserveRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/friends', friendsRoutes);

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
    logger.error('render.error', { slug, error: e.message });
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

// Global error handler for unhandled exceptions in routes
app.use((err, req, res, next) => {
  logger.error('http.error', { path: req.path, method: req.method, error: err.message });
  if (res.headersSent) return next(err);
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'CORS blocked' });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info('server.start', { port: PORT, env: process.env.NODE_ENV || 'development' });
  if (process.env.DISABLE_CRON !== '1') cronJobs.start();
});

// Graceful shutdown for Render / Docker
function shutdown(signal) {
  logger.info('server.shutdown', { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
