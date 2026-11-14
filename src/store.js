import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const derive = promisify(scrypt);
export const digest = (value) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [salt, expected] = encoded.split(':');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function createStore(path, { username, passwordHash }) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, hash TEXT UNIQUE NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS glossary (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      lang TEXT NOT NULL, source_key TEXT NOT NULL, source TEXT NOT NULL,
      target TEXT NOT NULL, created INTEGER NOT NULL,
      UNIQUE(user_id, lang, source_key)
    );
  `);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    if (!username || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash || '')) {
      db.close();
      throw new Error('ADMIN_USERNAME and a valid ADMIN_PASSWORD_HASH are required on first start.');
    }
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  }
  return {
    user: (name) => db.prepare('SELECT * FROM users WHERE username = ?').get(name),
    session(value) {
      if (!value) return undefined;
      return db.prepare(`SELECT users.id, username FROM sessions JOIN users ON users.id = user_id
        WHERE hash = ? AND expires > ?`).get(digest(value), Date.now());
    },
    token(value) {
      return db.prepare(`SELECT users.id, username FROM tokens JOIN users ON users.id = user_id
        WHERE hash = ?`).get(digest(value));
    },
    createSession(userId) {
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      const value = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(value), userId, Date.now() + 7 * 86400000);
      return value;
    },
    deleteSession: (value) => db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(value)),
    changePassword(userId, passwordHash) {
      db.exec('BEGIN');
      try {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    listTokens: (userId) => db.prepare('SELECT id, name, created FROM tokens WHERE user_id = ? ORDER BY created DESC').all(userId),
    glossary: (userId, lang) => db.prepare('SELECT id, source, target FROM glossary WHERE user_id = ? AND lang = ? ORDER BY created DESC').all(userId, lang),
    glossaryCount: (userId, lang) => db.prepare('SELECT COUNT(*) AS count FROM glossary WHERE user_id = ? AND lang = ?').get(userId, lang).count,
    glossarySummary(userId, lang) {
      const entries = db.prepare('SELECT id, source, target FROM glossary WHERE user_id = ? AND lang = ? ORDER BY created DESC').all(userId, lang);
      const count = db.prepare('SELECT COUNT(*) AS count FROM glossary WHERE user_id = ? AND lang = ?').get(userId, lang).count;
      return { lang, entries, count, limit: 200 };
    },
    saveGlossary(userId, lang, source, target) {
      db.prepare(`INSERT INTO glossary (user_id, lang, source_key, source, target, created)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, lang, source_key) DO UPDATE SET source = excluded.source, target = excluded.target`)
        .run(userId, lang, source.toLocaleLowerCase(), source, target, Date.now());
    },
    deleteGlossary: (userId, id) => db.prepare('DELETE FROM glossary WHERE user_id = ? AND id = ?').run(userId, id),
    createToken(userId, name) {
      const id = randomBytes(8).toString('hex');
      const value = `tr_${randomBytes(32).toString('base64url')}`;
      db.prepare('INSERT INTO tokens VALUES (?, ?, ?, ?, ?)').run(id, userId, name, digest(value), Date.now());
      return { id, name, token: value };
    },
    deleteToken: (userId, id) => db.prepare('DELETE FROM tokens WHERE user_id = ? AND id = ?').run(userId, id),
    close: () => db.close(),
  };
}
