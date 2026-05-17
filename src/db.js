const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'wedding.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    groom_name TEXT DEFAULT 'Groom',
    bride_name TEXT DEFAULT 'Bride',
    wedding_date TEXT DEFAULT '2026-12-31T18:00',
    venue_name TEXT DEFAULT 'The Grand Hall',
    venue_address TEXT DEFAULT '',
    map_url TEXT DEFAULT '',
    quote TEXT DEFAULT 'Hand in hand, heart to heart, our journey begins with love.',
    presence_text TEXT DEFAULT 'Your presence will make our day even more special.',
    hero_image TEXT DEFAULT '',
    gallery_images TEXT DEFAULT '[]',
    theme TEXT DEFAULT 'elegant',
    language TEXT DEFAULT 'en',
    published INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_email TEXT DEFAULT '',
    attending TEXT NOT NULL CHECK (attending IN ('yes','no')),
    guest_count INTEGER DEFAULT 1,
    message TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rsvps_invitation ON rsvps(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
`);

module.exports = db;
