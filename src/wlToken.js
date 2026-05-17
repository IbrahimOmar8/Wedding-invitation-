/**
 * Resolves the wish-listy access token for a local user, refreshing it
 * via the stored refresh token when expired. Returns null if the user
 * has not connected a wish-listy account or the refresh failed.
 */
const db = require('./db');
const wl = require('./wishlisty');
const { encrypt, decrypt } = require('./crypto');

async function getWishlistyToken(localUserId) {
  const row = db.prepare(`SELECT wishlisty_access_token, wishlisty_refresh_token, wishlisty_token_expires_at
                          FROM users WHERE id = ?`).get(localUserId);
  if (!row || !row.wishlisty_access_token) return null;

  const expires = row.wishlisty_token_expires_at ? new Date(row.wishlisty_token_expires_at).getTime() : 0;
  const access = decrypt(row.wishlisty_access_token);
  if (access && expires > Date.now()) return access;

  const refresh = decrypt(row.wishlisty_refresh_token);
  if (!refresh) return access || null;

  try {
    const r = await wl.refresh({ refreshToken: refresh });
    const newToken = r.token || r.accessToken;
    const newRefresh = r.refreshToken || refresh;
    if (!newToken) return access || null;
    const newExpires = new Date(Date.now() + 50 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET wishlisty_access_token=?, wishlisty_refresh_token=?, wishlisty_token_expires_at=? WHERE id=?')
      .run(encrypt(newToken), encrypt(newRefresh), newExpires, localUserId);
    return newToken;
  } catch (e) {
    return access || null;
  }
}

module.exports = { getWishlistyToken };
