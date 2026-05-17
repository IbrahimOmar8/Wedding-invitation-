/**
 * Public, guest-facing gift reservation. The guest enters their phone
 * (or email), receives an OTP via wish-listy, then reserves the item.
 * Below the surface we drive the wish-listy register/login/reserve flow
 * on the guest's behalf so they never need to leave the invitation page.
 *
 * Flow:
 *   1. POST /api/public/reserve/start  { slug, item_id, username, password? }
 *      → If the guest is new in wish-listy we register them; otherwise we
 *        log them in (and request a fresh OTP if their account is unverified).
 *      → Returns { requiresOtp, requiresPassword, reserve_token }
 *
 *   2. POST /api/public/reserve/verify { reserve_token, otp }
 *      → Verifies the OTP, calls wish-listy /api/items/:id/reserve, and
 *        returns { ok: true }.
 *
 * The reserve_token is a short-lived signed JWT that carries the guest's
 * username + item_id + the wish-listy refresh token. We never persist
 * anything about the guest in WedCard's database.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const wl = require('../wishlisty');
const db = require('../db');
const axios = require('axios');
const { SECRET } = require('../auth');

const router = express.Router();

const RESERVE_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const RANDOM_PW = () => 'G' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6) + '!';

function signReserveToken(payload) {
  return jwt.sign(payload, RESERVE_SECRET, { expiresIn: '15m' });
}

async function checkAccount(username, country_code) {
  try {
    const r = await axios.post(`${wl.baseUrl}/api/auth/check-account`,
      { username, country_code }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    return r.data; // expected shape: { exists, isVerified, ... }
  } catch (_) { return null; }
}

router.post('/start', async (req, res) => {
  const { slug, item_id, username, password, country_code } = req.body || {};
  if (!slug || !item_id || !username) return res.status(400).json({ error: 'slug, item_id and username are required' });

  // Confirm the invitation exists and is published before doing anything
  const u = db.prepare('SELECT id FROM users WHERE slug = ?').get(slug);
  if (!u) return res.status(404).json({ error: 'Invitation not found' });
  const inv = db.prepare('SELECT id, published FROM invitations WHERE user_id = ?').get(u.id);
  if (!inv?.published) return res.status(404).json({ error: 'Invitation not found' });

  const account = await checkAccount(username, country_code);

  // Existing verified account → need password to log in
  if (account?.exists && account?.isVerified) {
    if (!password) {
      return res.json({ requiresPassword: true, exists: true });
    }
    try {
      const login = await wl.login({ username, password, country_code });
      if (!login.token) return res.status(401).json({ error: 'Invalid credentials' });
      const token = signReserveToken({
        stage: 'ready', username, country_code: country_code || '',
        item_id, slug,
        wl_token: login.token, wl_refresh: login.refreshToken || '',
      });
      return res.json({ ready: true, reserve_token: token });
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  }

  // Existing but unverified → request a fresh OTP, then carry on to verify step
  if (account?.exists && !account?.isVerified) {
    try { await wl.resendOTP({ username, country_code }); } catch (_) {}
    const token = signReserveToken({
      stage: 'otp', username, country_code: country_code || '',
      item_id, slug, isNew: false,
    });
    return res.json({ requiresOtp: true, exists: true, reserve_token: token });
  }

  // No account yet → register with a generated password (the guest never needs to remember it).
  // wish-listy will email/SMS them an OTP we then verify.
  const pw = password || RANDOM_PW();
  try {
    await wl.register({ fullName: 'Wedding Guest', username, password: pw, country_code });
    const token = signReserveToken({
      stage: 'otp', username, country_code: country_code || '',
      item_id, slug, isNew: true, pw,
    });
    return res.json({ requiresOtp: true, exists: false, reserve_token: token });
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
});

router.post('/verify', async (req, res) => {
  const { reserve_token, otp, quantity } = req.body || {};
  if (!reserve_token || !otp) return res.status(400).json({ error: 'reserve_token and otp are required' });

  let payload;
  try { payload = jwt.verify(reserve_token, RESERVE_SECRET); }
  catch (_) { return res.status(400).json({ error: 'Reservation session expired. Start over.' }); }

  try {
    let wlToken;
    if (payload.stage === 'otp') {
      const v = await wl.verifyOTP({ username: payload.username, otp, country_code: payload.country_code });
      if (!v.token) return res.status(400).json({ error: 'Verification failed' });
      wlToken = v.token;
    } else if (payload.stage === 'ready') {
      wlToken = payload.wl_token;
    } else {
      return res.status(400).json({ error: 'Bad reservation token' });
    }

    // Reserve the item directly against wish-listy
    const r = await axios.post(
      `${wl.baseUrl}/api/items/${encodeURIComponent(payload.item_id)}/reserve`,
      { quantity: Math.max(1, Math.min(20, parseInt(quantity, 10) || 1)) },
      { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + wlToken }, timeout: 20000 }
    );
    return res.json({ ok: true, reservation: r.data });
  } catch (e) {
    return res.status(e?.response?.status || e.status || 502).json({
      error: e?.response?.data?.message || e.message || 'Reservation failed',
    });
  }
});

router.post('/cancel', async (req, res) => {
  // Lightweight client-side cancel that calls the reserve endpoint with DELETE.
  const { reserve_token } = req.body || {};
  if (!reserve_token) return res.status(400).json({ error: 'reserve_token required' });
  let payload;
  try { payload = jwt.verify(reserve_token, RESERVE_SECRET); }
  catch (_) { return res.status(400).json({ error: 'Token expired' }); }
  if (!payload.wl_token) return res.status(400).json({ error: 'No active session to cancel' });
  try {
    await axios.delete(`${wl.baseUrl}/api/items/${encodeURIComponent(payload.item_id)}/reserve`,
      { headers: { Authorization: 'Bearer ' + payload.wl_token } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e?.response?.status || 502).json({ error: e?.response?.data?.message || e.message });
  }
});

module.exports = router;
