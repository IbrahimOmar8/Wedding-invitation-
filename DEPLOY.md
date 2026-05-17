# Deployment Guide

## Quick deploy: Render (recommended)

The repo already ships a `render.yaml` blueprint.

1. Fork or push this repo to GitHub.
2. Go to https://dashboard.render.com → **New** → **Blueprint** → pick the repo.
3. Render will detect `render.yaml` and create the service. It also generates a `JWT_SECRET` and `ENCRYPT_KEY` for you.
4. After the first deploy, set these env vars in the Render dashboard:
   - `PUBLIC_URL` — your service URL (e.g. `https://wedcard.onrender.com`). Used in OG tags and reminder emails.
   - `ALLOWED_ORIGINS` — comma-separated list of origins allowed to call your API from a browser. Leave empty for "any origin without credentials".

Optional integrations (set them only if you want the feature on):

- **Cloudinary** for image hosting (recommended for production — Render's free plan does NOT persist disk writes across deploys):
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- **SMTP** for RSVP emails and reminders:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- **Firebase Cloud Messaging** for push notifications:
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

The 1 GB persistent disk in the blueprint stores `data/wedding.db`. **Don't remove it** — losing the disk means losing every user record and invitation.

## Docker

```bash
docker build -t wedcard .
docker run -p 3000:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ENCRYPT_KEY=$(openssl rand -hex 32) \
  -e WISHLISTY_BASE_URL=https://wish-listy-backend.onrender.com \
  -v wedcard_data:/app/data \
  -v wedcard_uploads:/app/uploads \
  wedcard
```

## Manual / VPS

```bash
git clone <repo-url>
cd Wedding-invitation-
npm install --omit=dev
cp .env.example .env   # then edit .env
node server.js         # or use pm2 / systemd
```

Put it behind nginx for TLS:

```nginx
server {
  server_name wedcard.example.com;
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
  }
}
```

Set `TRUST_PROXY=1` so the rate limiter and geoip read the real client IP.

## End-to-end test against a deployed instance

```bash
WEDCARD_URL=https://your-deployment.example.com node scripts/e2e-test.js
```

The test spins up a temp mailbox, signs up through your deployment (which proxies to wish-listy), receives a real OTP, verifies, links a wishlist, saves wedding details, and renders the public invitation in both English and Arabic. Currently 36 stages.

## Backups

The SQLite database lives at `data/wedding.db`. Back it up with WAL-safe copy:

```bash
sqlite3 data/wedding.db ".backup '/tmp/wedcard-$(date +%F).db'"
```

For Render, schedule a daily cron job to ship `/tmp/wedcard-*.db` to S3 / R2 / Cloudinary raw.
