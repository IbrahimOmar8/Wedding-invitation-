/**
 * Composable security middleware. Kept separate so server.js stays readable.
 *
 * - helmet: security headers
 * - cors: configurable allow-list (ALLOWED_ORIGINS env, comma-separated)
 * - rate limiters: separate limits for auth / public RSVP&wish posts / general API
 */
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

function corsMiddleware() {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  if (allowed.length === 0) return cors({ origin: true, credentials: false });

  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // non-browser clients
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });
}

const helmetMiddleware = helmet({
  contentSecurityPolicy: false,           // themes load Google fonts + inline scripts
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// Distinct buckets so an abusive RSVP flood doesn't lock out logins.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again later.' },
});

const publicWriteLimiter = rateLimit({
  windowMs: 60 * 1000, max: 12,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  standardHeaders: true, legacyHeaders: false,
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  authLimiter,
  publicWriteLimiter,
  apiLimiter,
};
