/**
 * AES-256-GCM encryption for at-rest secrets (wish-listy tokens).
 * Key is derived from ENCRYPT_KEY env var (or JWT_SECRET as fallback) via SHA-256.
 */
const crypto = require('crypto');

function getKey() {
  const src = process.env.ENCRYPT_KEY || process.env.JWT_SECRET || 'dev-secret-change-me';
  return crypto.createHash('sha256').update(String(src)).digest();
}

function encrypt(plain) {
  if (plain == null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return '';
  try {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch (_) {
    return '';
  }
}

module.exports = { encrypt, decrypt };
