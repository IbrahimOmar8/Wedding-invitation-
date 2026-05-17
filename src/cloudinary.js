/**
 * Optional Cloudinary uploader. If CLOUDINARY_* env vars are present we
 * upload there; otherwise the upload route writes to the local /uploads
 * folder as before.
 */
const fs = require('fs');

let cloudinary = null;
let configured = false;

function init() {
  if (configured) return cloudinary;
  configured = true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  } catch (e) {
    console.warn('[cloudinary] init failed:', e.message);
    cloudinary = null;
  }
  return cloudinary;
}

function isEnabled() { init(); return !!cloudinary; }

async function uploadFile(localPath, folder = 'wedcard') {
  init();
  if (!cloudinary) return null;
  const r = await cloudinary.uploader.upload(localPath, {
    folder,
    resource_type: 'image',
    transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
  });
  // Best-effort cleanup of the local tempfile after upload
  try { fs.unlinkSync(localPath); } catch (_) {}
  return { url: r.secure_url, public_id: r.public_id };
}

async function destroy(publicId) {
  init();
  if (!cloudinary || !publicId) return;
  try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
}

module.exports = { isEnabled, uploadFile, destroy };
