import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../../serve.mjs';
import { createDatabase } from '../../server/database.js';
import { backupDatabase } from '../../scripts/backup.mjs';

async function startServer(t, options = {}) {
  const server = createApp({ databasePath: ':memory:', ...options });
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  return `http://127.0.0.1:${server.address().port}`;
}

async function postJson(url, body, cookie) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

function createTestMailer() {
  const messages = [];
  return {
    messages,
    sendVerification: async (message) => messages.push({ kind: 'verification', ...message }),
    sendPasswordReset: async (message) => messages.push({ kind: 'reset', ...message }),
  };
}

function tokenFromLink(link) {
  const hash = new URL(link).hash;
  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('token');
}

async function registerAndVerify(base, email, password, mailer, registrationKey = '') {
  const registration = await postJson(`${base}/api/register`, { email, password, registrationKey });
  assert.equal(registration.status, 202);
  const message = mailer.messages.find((item) => item.kind === 'verification' && item.to === email);
  assert.ok(message, 'un lien de validation est envoyé');
  const verification = await postJson(`${base}/api/verify-email`, { token: tokenFromLink(message.url) });
  assert.equal(verification.status, 200);
  return sessionCookie(verification);
}

test('API comptes : inscription, login, session HttpOnly et déconnexion', async (t) => {
  const mailer = createTestMailer();
  const base = await startServer(t, { emailSender: mailer, publicBaseUrl: 'https://tontine.test' });
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.deepEqual(await (await fetch(`${base}/api/healthz`)).json(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { registrationRequiresKey: false, emailVerificationRequired: true });
  assert.equal((await fetch(`${base}/api/session`)).status, 401);
  const crossSite = await fetch(`${base}/api/logout`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(crossSite.status, 403);
  assert.equal((await postJson(`${base}/api/register`, { email: 'bad@example.test', password: 'short' })).status, 400);

  const created = await postJson(`${base}/api/register`, { email: 'owner@example.test', password: 'a long test password' });
  assert.equal(created.status, 202);
  assert.equal(created.headers.get('set-cookie'), null, 'aucune session avant vérification');
  assert.equal((await postJson(`${base}/api/login`, { email: 'owner@example.test', password: 'a long test password' })).status, 403);
  const firstVerificationMail = mailer.messages.find((message) => message.kind === 'verification');
  const resend = await postJson(`${base}/api/resend-verification`, { email: 'owner@example.test' });
  assert.equal(resend.status, 202);
  assert.match((await resend.json()).message, /Si un compte non validé/);
  assert.equal((await postJson(`${base}/api/verify-email`, { token: tokenFromLink(firstVerificationMail.url) })).status, 400);
  const verificationMail = mailer.messages.filter((message) => message.kind === 'verification').at(-1);
  assert.equal(new URL(verificationMail.url).origin, 'https://tontine.test');
  const verificationToken = tokenFromLink(verificationMail.url);
  const verified = await postJson(`${base}/api/verify-email`, { token: verificationToken });
  assert.equal(verified.status, 200);
  assert.match(verified.headers.get('set-cookie'), /HttpOnly/);
  assert.match(verified.headers.get('set-cookie'), /SameSite=Lax/);
  const ownerCookie = sessionCookie(verified);
  const session = await fetch(`${base}/api/session`, { headers: { cookie: ownerCookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, 'owner@example.test');
  assert.equal((await postJson(`${base}/api/verify-email`, { token: verificationToken })).status, 400, 'le jeton de validation est à usage unique');

  assert.equal((await postJson(`${base}/api/register`, { email: 'owner@example.test', password: 'a long test password' })).status, 409);
  assert.equal((await postJson(`${base}/api/login`, { email: 'owner@example.test', password: 'incorrect password' })).status, 401);
  assert.equal((await postJson(`${base}/api/login`, { email: 'owner@example.test', password: 'x'.repeat(129) })).status, 401);
  const login = await postJson(`${base}/api/login`, { email: 'owner@example.test', password: 'a long test password' });
  assert.equal(login.status, 200);
  assert.equal((await fetch(`${base}/api/session`, { headers: { cookie: sessionCookie(login) } })).status, 200);

  assert.equal((await postJson(`${base}/api/logout`, {}, ownerCookie)).status, 200);
  assert.equal((await fetch(`${base}/api/session`, { headers: { cookie: ownerCookie } })).status, 401);
});

test('inscription production : code requis et configuration sans code refusée', async (t) => {
  assert.throws(() => createApp({ databasePath: ':memory:', secureCookies: true }), /REGISTRATION_KEY/);
  assert.throws(() => createApp({
    databasePath: ':memory:',
    secureCookies: true,
    registrationKey: 'secret-code-de-test',
    publicBaseUrl: 'https://tontine.test',
  }), /SMTP_HOST/);
  const base = await startServer(t, { registrationKey: 'secret-code-de-test' });
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { registrationRequiresKey: true, emailVerificationRequired: true });
  assert.equal((await postJson(`${base}/api/register`, { email: 'blocked@example.test', password: 'a long test password' })).status, 403);
  assert.equal((await postJson(`${base}/api/register`, { email: 'blocked@example.test', password: 'a long test password', registrationKey: 'wrong' })).status, 403);
  assert.equal((await postJson(`${base}/api/register`, { email: 'invited@example.test', password: 'a long test password', registrationKey: 'secret-code-de-test' })).status, 202);
});

test('GitHub Pages vers API : CORS autorise uniquement l’origine configurée et les cookies cross-site sont Secure', async (t) => {
  const mailer = createTestMailer();
  const origin = 'https://michelkamani202-alt.github.io';
  const base = await startServer(t, {
    registrationKey: 'invite-secret',
    secureCookies: true,
    crossSiteCookies: true,
    publicBaseUrl: 'https://tontine.example.test',
    appOrigin: origin,
    emailSender: mailer,
  });

  const config = await fetch(`${base}/api/config`, { headers: { origin } });
  assert.equal(config.status, 200);
  assert.equal(config.headers.get('access-control-allow-origin'), origin);
  assert.equal(config.headers.get('access-control-allow-credentials'), 'true');

  const preflight = await fetch(`${base}/api/state`, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods'), /PUT/);

  assert.equal((await fetch(`${base}/api/config`, { headers: { origin: 'https://evil.example' } })).status, 403);
  const registration = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'pages@example.test', password: 'a long test password', registrationKey: 'invite-secret' }),
  });
  assert.equal(registration.status, 202);
  const verify = await fetch(`${base}/api/verify-email`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ token: tokenFromLink(mailer.messages[0].url) }),
  });
  assert.equal(verify.status, 200);
  assert.match(verify.headers.get('set-cookie'), /SameSite=None/);
  assert.match(verify.headers.get('set-cookie'), /Secure/);
});

test('validation e-mail et récupération : jetons uniques, réponses neutres et révocation des sessions', async (t) => {
  const mailer = createTestMailer();
  const base = await startServer(t, { emailSender: mailer, publicBaseUrl: 'https://tontine.test' });
  const cookie = await registerAndVerify(base, 'reset@example.test', 'a long test password', mailer);

  const known = await postJson(`${base}/api/forgot-password`, { email: 'reset@example.test' });
  const unknown = await postJson(`${base}/api/forgot-password`, { email: 'missing@example.test' });
  assert.equal(known.status, 202);
  assert.deepEqual(await known.json(), await unknown.json());
  const resetEmail = mailer.messages.find((message) => message.kind === 'reset');
  assert.ok(resetEmail);
  const resetToken = tokenFromLink(resetEmail.url);

  assert.equal((await postJson(`${base}/api/reset-password`, { token: resetToken, password: 'short' })).status, 400);
  const reset = await postJson(`${base}/api/reset-password`, { token: resetToken, password: 'a replacement password' });
  assert.equal(reset.status, 200);
  assert.equal((await fetch(`${base}/api/session`, { headers: { cookie } })).status, 401);
  assert.equal((await postJson(`${base}/api/login`, { email: 'reset@example.test', password: 'a long test password' })).status, 401);
  assert.equal((await postJson(`${base}/api/login`, { email: 'reset@example.test', password: 'a replacement password' })).status, 200);
  assert.equal((await postJson(`${base}/api/reset-password`, { token: resetToken, password: 'another replacement password' })).status, 400);
});

test('jetons e-mail expirés : validation et reset refusés', async () => {
  const database = createDatabase(':memory:');
  try {
    const user = await database.createUser('expired@example.test', 'a long test password');
    const verificationToken = database.createEmailToken(user.id, 'verify_email', -1);
    const resetToken = database.createEmailToken(user.id, 'reset_password', -1);
    assert.equal(database.verifyEmailToken(verificationToken), null);
    assert.equal(await database.resetPasswordWithToken(resetToken, 'a replacement password'), null);
  } finally {
    database.close();
  }
});

test('API données : isolation par compte et conflit de révision explicite', async (t) => {
  const mailer = createTestMailer();
  const base = await startServer(t, { emailSender: mailer });
  const ownerCookie = await registerAndVerify(base, 'one@example.test', 'a long test password', mailer);
  const state = { version: 1, counter: 0, profile: { name: '', phone: '' }, activeGroupId: null, groups: [] };

  const saved = await fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ state, revision: 0 }),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 1);

  const staleWrite = await fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: ownerCookie },
    body: JSON.stringify({ state, revision: 0 }),
  });
  assert.equal(staleWrite.status, 409);
  assert.equal((await fetch(`${base}/api/state`)).status, 401);

  const otherCookie = await registerAndVerify(base, 'two@example.test', 'another long password', mailer);
  const otherState = await fetch(`${base}/api/state`, { headers: { cookie: otherCookie } });
  assert.equal(otherState.status, 200);
  assert.deepEqual(await otherState.json(), { state: null, revision: 0 });
});

test('SQLite : compte, session et données survivent à la réouverture de la base', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tontinepro-db-'));
  const path = join(directory, 'test.sqlite');
  const state = { version: 1, counter: 1, profile: { name: 'Test', phone: '' }, activeGroupId: null, groups: [] };
  let database = createDatabase(path);
  try {
    const user = await database.createUser('persist@example.test', 'a persistent test password');
    const session = database.createSession(user.id);
    assert.equal(database.writeState(user.id, state, 0).revision, 1);
    database.close();

    database = createDatabase(path);
    assert.equal(database.findSession(session.token).email, 'persist@example.test');
    assert.deepEqual(database.readState(user.id), { state, revision: 1 });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('migration : les comptes existants sont marqués vérifiés sans perte', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tontinepro-migration-'));
  const path = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO users VALUES ('legacy-id', 'legacy@example.test', 'salt', 'hash', '2025-01-02T03:04:05.000Z');
  `);
  legacy.close();
  const database = createDatabase(path);
  try {
    const user = database.findUserByEmail('legacy@example.test');
    assert.equal(user.id, 'legacy-id');
    assert.equal(user.email_verified_at, '2025-01-02T03:04:05.000Z');
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('backup : copie cohérente d’une base SQLite active', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tontinepro-backup-'));
  const sourcePath = join(directory, 'source.sqlite');
  const outputDirectory = join(directory, 'backups');
  const expiredBackup = join(outputDirectory, 'tontinepro-2026-09-01T00-00-00-000Z.sqlite');
  const unrelatedFile = join(outputDirectory, 'keep.txt');
  const source = new DatabaseSync(sourcePath);
  source.exec("CREATE TABLE fixture (value TEXT); INSERT INTO fixture VALUES ('stored')");
  source.close();
  try {
    await import('node:fs/promises').then(({ mkdir }) => mkdir(outputDirectory, { recursive: true }));
    writeFileSync(expiredBackup, 'expired');
    writeFileSync(unrelatedFile, 'keep');
    const oldDate = new Date('2026-09-01T00:00:00.000Z');
    utimesSync(expiredBackup, oldDate, oldDate);
    const backupPath = await backupDatabase(sourcePath, outputDirectory, new Date('2026-11-06T12:00:00.000Z'));
    assert.equal(existsSync(expiredBackup), false);
    assert.equal(existsSync(unrelatedFile), true);
    const copy = new DatabaseSync(backupPath);
    try {
      assert.equal(copy.prepare('SELECT value FROM fixture').get().value, 'stored');
    } finally {
      copy.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
