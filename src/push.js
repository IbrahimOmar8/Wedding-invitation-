/**
 * Push notifications via Firebase Cloud Messaging.
 * Configure with FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.
 * Falls back to console.log when not configured — same pattern as src/email.js.
 */
let admin = null;
let configured = false;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  const { FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) return;
  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: FIREBASE_CLIENT_EMAIL,
        }),
      });
    }
    configured = true;
  } catch (e) {
    console.warn('[push] firebase-admin not available:', e.message);
  }
}

async function sendToToken(token, { title, body, data }) {
  init();
  if (!configured) {
    console.log('[push:dev]', { token: token?.slice(0, 16) + '…', title, body, data });
    return { dev: true };
  }
  if (!token) return { skipped: 'no token' };
  try {
    const id = await admin.messaging().send({
      token,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
    });
    return { id };
  } catch (e) {
    if (/registration-token-not-registered/i.test(e.message)) return { error: 'unregistered' };
    console.error('[push] send error:', e.message);
    return { error: e.message };
  }
}

module.exports = { sendToToken };
