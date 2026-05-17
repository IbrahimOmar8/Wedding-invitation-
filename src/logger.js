/**
 * Minimal structured logger. JSON in production, human-readable in dev.
 * Use: logger.info('rsvp.received', { slug, count }).
 */
const isProd = process.env.NODE_ENV === 'production';

function fmt(level, msg, meta) {
  if (isProd) {
    return JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta || {}) });
  }
  const m = meta ? ' ' + JSON.stringify(meta) : '';
  return `[${level}] ${msg}${m}`;
}

module.exports = {
  info: (msg, meta) => console.log(fmt('info', msg, meta)),
  warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
  error: (msg, meta) => console.error(fmt('error', msg, meta)),
  debug: (msg, meta) => { if (!isProd) console.log(fmt('debug', msg, meta)); },
};
