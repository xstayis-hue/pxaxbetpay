const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.PXAX_DB_PATH || path.join(__dirname, 'pxax.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  photo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, currency)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product TEXT NOT NULL,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  wallet_id INTEGER REFERENCES wallets(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  product TEXT,
  provider_ref TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  instagram_nick TEXT,
  phone TEXT,
  region TEXT,
  target_instagram TEXT,
  telegram_username TEXT,
  amount INTEGER,
  receipt_name TEXT,
  transfer_method TEXT,
  transfer_details TEXT,
  withdrawal_type TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

function getOrCreateUser({ telegramId, username, firstName, photoUrl }) {
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (existing) {
    db.prepare(`UPDATE users SET username = COALESCE(?, username), first_name = COALESCE(?, first_name),
      photo_url = COALESCE(?, photo_url), updated_at = datetime('now') WHERE id = ?`)
      .run(username || null, firstName || null, photoUrl || null, existing.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
  }
  const info = db.prepare(
    'INSERT INTO users (telegram_id, username, first_name, photo_url) VALUES (?, ?, ?, ?)'
  ).run(telegramId, username || null, firstName || null, photoUrl || null);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  // seed default VPHX wallet
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, currency, balance) VALUES (?, ?, 0)').run(user.id, 'VPHX');
  return user;
}

module.exports = { db, getOrCreateUser };
