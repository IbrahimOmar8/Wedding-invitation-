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
    view_count INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    max_guests INTEGER DEFAULT 2,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    message TEXT NOT NULL,
    approved INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_date TEXT DEFAULT '',
    venue_name TEXT DEFAULT '',
    venue_address TEXT DEFAULT '',
    map_url TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS story (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    sub TEXT DEFAULT '',
    body TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_rsvps_invitation ON rsvps(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
  CREATE INDEX IF NOT EXISTS idx_guests_invitation ON guests(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_guests_token ON guests(token);
  CREATE INDEX IF NOT EXISTS idx_wishes_invitation ON wishes(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_events_invitation ON events(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_story_invitation ON story(invitation_id);
  CREATE INDEX IF NOT EXISTS idx_registry_invitation ON registry(invitation_id);
`);

// Idempotent migrations for users upgrading existing DBs
function addColumnIfMissing(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
addColumnIfMissing('invitations', 'view_count', 'INTEGER DEFAULT 0');

module.exports = db;
