# WedCard — Wedding Invitation SaaS

A multi-tenant SaaS that lets couples create their own customizable wedding invitation page with a full admin dashboard.

Each user gets a personal invitation URL like `/i/their-slug`, can edit names, date, venue, quote and photos, manage RSVPs, and switch between three different themes.

## Features

- **Multi-tenant signup** — every user gets their own invitation
- **Admin dashboard** — edit details, upload images, switch themes, view RSVPs
- **Three themes** — Elegant, Royal, Garden
- **Image uploads** — cover photo + up to 12 gallery images per user
- **RSVP system** — guests reply via the public invitation page; stats and replies in the dashboard
- **Publish toggle** — hide your invitation from public view at any time
- **Auto countdown** — to the wedding date and "Add to Calendar" link
- **JWT auth** — secure, stateless

## Stack

- Node.js + Express
- SQLite (better-sqlite3) — file-based, zero setup
- JWT auth with bcryptjs
- Multer for image uploads
- Plain HTML/CSS/JS for the frontend (no build step)

## Quick Start

```bash
npm install
cp .env.example .env
# edit .env to set a JWT_SECRET
npm start
```

The app runs on http://localhost:3000

## Routes

### Public
- `GET /` — landing page
- `GET /signup` `GET /login` — auth pages
- `GET /i/:slug` — the public wedding invitation
- `POST /api/rsvp/:slug` — submit an RSVP

### Authenticated (Bearer token)
- `GET /dashboard` — admin UI
- `GET /api/invitation` — load current user's invitation
- `PUT /api/invitation` — update invitation fields
- `POST /api/invitation/gallery` / `DELETE /api/invitation/gallery` — manage gallery
- `POST /api/upload` — upload an image (JPG, PNG, WEBP, GIF; 5MB max)
- `GET /api/rsvp` — list RSVPs and stats
- `DELETE /api/rsvp/:id` — delete a reply

## Project Structure

```
.
├── server.js              # Express app entrypoint
├── src/
│   ├── db.js              # SQLite schema + connection
│   ├── auth.js            # JWT sign/verify + middleware
│   ├── render.js          # Theme template renderer
│   └── routes/
│       ├── auth.js        # signup, login, slug check
│       ├── invitation.js  # CRUD for invitation + gallery
│       ├── rsvp.js        # RSVP submit + list
│       └── upload.js      # image upload via multer
├── views/themes/
│   ├── elegant.html       # Theme 1 (default)
│   ├── royal.html         # Theme 2
│   └── garden.html        # Theme 3
├── public/
│   ├── index.html         # SaaS landing
│   ├── signup.html / login.html
│   ├── dashboard.html
│   ├── 404.html
│   ├── css/               # landing.css, auth.css, dashboard.css
│   ├── js/dashboard.js    # dashboard logic
│   └── assets/            # default hero SVG + sample images
├── uploads/                # user-uploaded images (per user folder)
├── data/                   # SQLite database
└── package.json
```

## Theme Variables

Themes are plain HTML files in `views/themes/`. Variables substituted at render time:

| Variable | Description |
|---|---|
| `{{GROOM}}` / `{{BRIDE}}` | Couple names |
| `{{DATE_LONG}}` | "8 MAY 2026" |
| `{{WEEKDAY}}` | "FRIDAY" |
| `{{TIME}}` | "02:30 PM" |
| `{{WEDDING_ISO}}` | ISO date string (for the JS countdown) |
| `{{VENUE_NAME}}` / `{{VENUE_ADDRESS}}` | Venue details |
| `{{MAP_URL}}` | Google Maps link |
| `{{CALENDAR_URL}}` | Auto-generated Google Calendar link |
| `{{QUOTE}}` / `{{PRESENCE}}` | Quote text and presence note |
| `{{HERO_IMAGE}}` | Cover image URL |
| `{{GALLERY_HTML}}` | Pre-rendered HTML for the gallery photos |
| `{{SLUG}}` | The user's slug (used by RSVP form) |
| `{{LANG}}` / `{{DIR}}` | Language code and text direction |

## Adding a New Theme

1. Create `views/themes/yourtheme.html` (copy an existing one as a starting point)
2. Add it to `VALID_THEMES` in `src/routes/invitation.js`
3. Add a theme card to `public/dashboard.html` (the theme picker) and `public/index.html` (landing)
4. Add a preview style in `public/css/dashboard.css` and `public/css/landing.css`

## Notes

- The SQLite DB file is created automatically on first run in `data/wedding.db`.
- User uploads are stored on disk in `uploads/{user_id}/`. For production, move to S3 or similar.
- Passwords are hashed with bcrypt; JWTs are signed with `JWT_SECRET` from env (default for dev only).
