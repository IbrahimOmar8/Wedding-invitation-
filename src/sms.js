/**
 * SMS via Twilio. Configure with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * and TWILIO_PHONE_NUMBER. Without them we fall back to console.log so
 * dev runs and tests don't require credentials.
 *
 * Same pattern as src/email.js and src/push.js — the rest of the app
 * never has to check whether SMS is configured.
 */
let client = null;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return;
  try {
    const twilio = require('twilio');
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('[sms] twilio not loaded:', e.message);
  }
}

function normalizePhone(p) {
  if (!p) return '';
  const v = String(p).trim();
  if (!v) return '';
  if (v.startsWith('+')) return v.replace(/[^\d+]/g, '');
  const digits = v.replace(/\D/g, '');
  // Single-country fallback; if your audience is mostly Egypt prefix +20,
  // override per call by passing an already-prefixed number.
  return digits ? '+' + digits : '';
}

async function send(to, body) {
  init();
  const num = normalizePhone(to);
  if (!num) return { skipped: 'no recipient' };
  const text = String(body || '').slice(0, 1500);
  if (!client) {
    console.log('[sms:dev]', { to: num, body: text.slice(0, 120) });
    return { dev: true };
  }
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { error: 'TWILIO_PHONE_NUMBER not set' };
  try {
    const r = await client.messages.create({ from, to: num, body: text });
    return { sid: r.sid };
  } catch (e) {
    if (e.code === 21211) return { error: 'invalid recipient' };
    console.error('[sms] send error:', e.message);
    return { error: e.message };
  }
}

module.exports = { send, normalizePhone };
