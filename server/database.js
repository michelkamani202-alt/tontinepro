import { randomBytes, randomUUID, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;
const PASSWORD_BYTES = 64;

export function createDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      email_verified_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS email_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS email_tokens_user ON email_tokens(user_id, purpose);
    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'email_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
    db.exec('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL');
  }

  return {
    close: () => db.close(),
    healthCheck() {
      db.prepare('SELECT 1').get();
      return true;
    },
    findUserByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    verifyUserDirectly(userId) {
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
        .run(new Date().toISOString(), userId);
    },
    async createUser(email, password) {
      const salt = randomBytes(16);
      const hash = await scrypt(password, salt, PASSWORD_BYTES, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const user = { id: randomUUID(), email, password_salt: salt.toString('hex'), password_hash: Buffer.from(hash).toString('hex') };
      db.prepare('INSERT INTO users (id, email, password_salt, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?, NULL)')
        .run(user.id, user.email, user.password_salt, user.password_hash, new Date().toISOString());
      return { id: user.id, email: user.email };
    },
    createEmailToken(userId, purpose, lifetimeMs) {
      db.prepare('DELETE FROM email_tokens WHERE expires_at <= ?').run(Date.now());
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
      db.prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(tokenHash, userId, purpose, Date.now() + lifetimeMs, new Date().toISOString());
      return token;
    },
    verifyEmailToken(token) {
      const tokenHash = createHash('sha256').update(String(token || '')).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare(`
          SELECT users.id, users.email FROM email_tokens
          JOIN users ON users.id = email_tokens.user_id
          WHERE email_tokens.token_hash = ? AND email_tokens.purpose = 'verify_email' AND email_tokens.expires_at > ?
        `).get(tokenHash, Date.now());
        if (!row) {
          db.exec('ROLLBACK');
          return null;
        }
        db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
          .run(new Date().toISOString(), row.id);
        db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(row.id, 'verify_email');
        db.exec('COMMIT');
        return { id: row.id, email: row.email };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async resetPasswordWithToken(token, password) {
      const tokenHash = createHash('sha256').update(String(token || '')).digest('hex');
      const candidate = db.prepare(`
        SELECT users.id FROM email_tokens
        JOIN users ON users.id = email_tokens.user_id
        WHERE email_tokens.token_hash = ? AND email_tokens.purpose = 'reset_password' AND email_tokens.expires_at > ?
      `).get(tokenHash, Date.now());
      if (!candidate) return null;

      const salt = randomBytes(16);
      const hash = Buffer.from(await scrypt(password, salt, PASSWORD_BYTES, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
      db.exec('BEGIN IMMEDIATE');
      try {
        const valid = db.prepare(`
          SELECT users.id, users.email FROM email_tokens
          JOIN users ON users.id = email_tokens.user_id
          WHERE email_tokens.token_hash = ? AND email_tokens.purpose = 'reset_password' AND email_tokens.expires_at > ?
        `).get(tokenHash, Date.now());
        if (!valid) {
          db.exec('ROLLBACK');
          return null;
        }
        db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?')
          .run(salt.toString('hex'), hash.toString('hex'), valid.id);
        db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(valid.id, 'reset_password');
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(valid.id);
        db.exec('COMMIT');
        return { id: valid.id, email: valid.email };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async verifyPassword(user, password) {
      const actual = Buffer.from(await scrypt(password, Buffer.from(user.password_salt, 'hex'), PASSWORD_BYTES, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
      const expected = Buffer.from(user.password_hash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
    createSession(userId) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
      return { token, expiresAt };
    },
    findSession(token) {
      if (!token) return null;
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const session = db.prepare(`
        SELECT users.id, users.email, users.email_verified_at, sessions.expires_at
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `).get(tokenHash, Date.now());
      return session ? { id: session.id, email: session.email, emailVerified: Boolean(session.email_verified_at) } : null;
    },
    deleteSession(token) {
      if (!token) return;
      const tokenHash = createHash('sha256').update(token).digest('hex');
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    readState(userId) {
      const row = db.prepare('SELECT state_json, revision FROM user_state WHERE user_id = ?').get(userId);
      return row ? { state: JSON.parse(row.state_json), revision: row.revision } : { state: null, revision: 0 };
    },
    writeState(userId, state, expectedRevision) {
      if (!validState(state) || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
        return { error: 'invalid' };
      }
      const stateJson = JSON.stringify(state);
      if (Buffer.byteLength(stateJson, 'utf8') > 5 * 1024 * 1024) return { error: 'too_large' };
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT revision FROM user_state WHERE user_id = ?').get(userId);
        const currentRevision = row?.revision || 0;
        if (currentRevision !== expectedRevision) {
          db.exec('ROLLBACK');
          return { error: 'conflict', revision: currentRevision };
        }
        const revision = currentRevision + 1;
        db.prepare(`
          INSERT INTO user_state (user_id, state_json, revision, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, revision = excluded.revision, updated_at = excluded.updated_at
        `).run(userId, stateJson, revision, new Date().toISOString());
        db.exec('COMMIT');
        return { revision };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function validState(state) {
  return Boolean(
    state &&
      typeof state === 'object' &&
      state.version === 1 &&
      Number.isInteger(state.counter) &&
      state.counter >= 0 &&
      state.profile &&
      typeof state.profile.name === 'string' &&
      typeof state.profile.phone === 'string' &&
      Array.isArray(state.groups) &&
      state.groups.length <= 500 &&
      state.groups.every((group) =>
        group &&
        typeof group.id === 'string' &&
        typeof group.name === 'string' &&
        Number.isSafeInteger(group.amount) &&
        Array.isArray(group.members) &&
        Array.isArray(group.order) &&
        Array.isArray(group.payments) &&
        Array.isArray(group.payouts)
      )
  );
}