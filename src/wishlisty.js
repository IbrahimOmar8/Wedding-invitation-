/**
 * Thin client for the wish-listy backend.
 * See: https://github.com/IbrahimOmar8/wish-listy-backend
 *
 * All endpoints return the parsed response data. Errors are thrown as
 * Error objects with .status and .data on them so route handlers can
 * forward the original message.
 */
const axios = require('axios');

const BASE_URL = (process.env.WISHLISTY_BASE_URL || 'https://wish-listy-backend.onrender.com').replace(/\/$/, '');

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

function wrap(error) {
  const e = new Error(error?.response?.data?.message || error.message || 'Wish Listy request failed');
  e.status = error?.response?.status || 502;
  e.data = error?.response?.data;
  return e;
}

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

const wl = {
  baseUrl: BASE_URL,

  // ─── Auth ───
  async register({ fullName, username, password, country_code }) {
    try { const r = await client.post('/api/auth/register', { fullName, username, password, country_code }); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async verifyOTP({ username, otp, country_code }) {
    try { const r = await client.post('/api/auth/verify-otp', { username, otp, country_code }); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async resendOTP({ username, country_code }) {
    try { const r = await client.post('/api/auth/resend-otp', { username, country_code }); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async login({ username, password, country_code }) {
    try { const r = await client.post('/api/auth/login', { username, password, country_code }); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async refresh({ refreshToken }) {
    try { const r = await client.post('/api/auth/refresh', { refreshToken }); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async getMe(token) {
    try { const r = await client.get('/api/auth/me', auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },

  // ─── Wishlists ───
  async listWishlists(token) {
    try { const r = await client.get('/api/wishlists', auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async getWishlist(token, id) {
    try { const r = await client.get(`/api/wishlists/${id}`, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async createWishlist(token, payload) {
    try { const r = await client.post('/api/wishlists', payload, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },

  // ─── Items ───
  async listItems(token, wishlistId) {
    // Some deployments expose /api/wishlists/:id which already includes items;
    // others have /api/items?wishlist=:id. Try the wishlist endpoint first.
    try {
      const r = await client.get(`/api/wishlists/${wishlistId}`, auth(token));
      return r.data;
    } catch (e) { throw wrap(e); }
  },

  // ─── Events ───
  async createEvent(token, payload) {
    try { const r = await client.post('/api/events', payload, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async updateEvent(token, id, payload) {
    try { const r = await client.put(`/api/events/${id}`, payload, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async linkWishlistToEvent(token, eventId, wishlistId) {
    try { const r = await client.put(`/api/events/${eventId}/wishlist`, { wishlist_id: wishlistId }, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },
  async getEvent(token, id) {
    try { const r = await client.get(`/api/events/${id}`, auth(token)); return r.data; }
    catch (e) { throw wrap(e); }
  },

  // ─── Health ───
  async ping() {
    try { const r = await client.get('/', { timeout: 5000 }); return r.data; }
    catch (e) { throw wrap(e); }
  },
};

module.exports = wl;
