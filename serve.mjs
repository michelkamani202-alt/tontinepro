// Petit serveur statique sans dépendance : `npm start` puis http://localhost:8080
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './server/database.js';
import { createDevelopmentMailer, createMailerFromEnv } from './server/email.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const DEFAULT_DB = join(ROOT, 'data', 'tontinepro.sqlite');
const SESSION_COOKIE = 'tontinepro_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_AUTH_BUCKETS = 10000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const PUBLIC = ['index.html', 'config.js', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons'];

function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new Error('Content-Type application/json requis.'), { status: 415 });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('Requête trop volumineuse.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON invalide.'), { status: 400 });
  }
}

function cookieValue(req, name) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : '';
}

function matchesSecret(value, expected) {
  const actualHash = createHash('sha256').update(String(value || '')).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function createApp({
  databasePath = process.env.TONTINE_DB_PATH || DEFAULT_DB,
  secureCookies = process.env.NODE_ENV === 'production',
  registrationKey = process.env.REGISTRATION_KEY || '',
  trustProxy = process.env.TRUST_PROXY === 'true',
  appOrigin = process.env.APP_ORIGIN || '',
  crossSiteCookies = process.env.CROSS_SITE_COOKIES === 'true',
  publicBaseUrl = process.env.PUBLIC_BASE_URL || '',
  emailSender = null,
} = {}) {
  if (secureCookies && !registrationKey) throw new Error('REGISTRATION_KEY doit être défini en production.');
  if (secureCookies && !/^https:\/\//i.test(publicBaseUrl)) throw new Error('PUBLIC_BASE_URL HTTPS doit être défini en production.');
  if (appOrigin) {
    let parsedOrigin;
    try { parsedOrigin = new URL(appOrigin); } catch { throw new Error('APP_ORIGIN doit être une origine valide sans chemin.'); }
    if (parsedOrigin.origin !== appOrigin || (secureCookies && parsedOrigin.protocol !== 'https:')) {
      throw new Error('APP_ORIGIN doit être une origine HTTPS valide en production.');
    }
  }
  if (crossSiteCookies && !secureCookies) throw new Error('CROSS_SITE_COOKIES exige NODE_ENV=production et des cookies Secure.');
  const mailer = emailSender || (secureCookies ? createMailerFromEnv() : createDevelopmentMailer());
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const database = createDatabase(databasePath);
  const authAttempts = new Map();
  let lastAuthCleanup = Date.now();
  const actionUrl = (req, route, token) => {
    const base = publicBaseUrl || `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
    const url = new URL(base.endsWith('/') ? base : `${base}/`);
    url.hash = `/${route}?token=${encodeURIComponent(token)}`;
    return url.href;
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const method = req.method || 'GET';
        const origin = req.headers.origin || '';
        if (appOrigin && origin && origin !== appOrigin) {
          sendJson(res, 403, { error: 'Origine non autorisée.' });
          return;
        }
        if (appOrigin && origin === appOrigin) {
          res.setHeader('access-control-allow-origin', appOrigin);
          res.setHeader('access-control-allow-credentials', 'true');
          res.setHeader('vary', 'Origin');
        }
        if (method === 'OPTIONS') {
          if (!appOrigin || origin !== appOrigin) {
            sendJson(res, 403, { error: 'Origine non autorisée.' });
            return;
          }
          res.writeHead(204, {
            ...SECURITY_HEADERS,
            'access-control-allow-origin': appOrigin,
            'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
            'access-control-allow-headers': 'Content-Type',
            'access-control-max-age': '600',
            vary: 'Origin',
          });
          res.end();
          return;
        }
        if (url.pathname === '/api/healthz' && method === 'GET') {
          database.healthCheck();
          sendJson(res, 200, { status: 'ok' });
          return;
        }
        if (
          ['POST', 'PUT', 'DELETE'].includes(method) &&
          req.headers['sec-fetch-site'] === 'cross-site' &&
          origin !== appOrigin
        ) {
          sendJson(res, 403, { error: 'Requête inter-origine refusée.' });
          return;
        }

        if (url.pathname === '/api/config' && method === 'GET') {
          sendJson(res, 200, { registrationRequiresKey: Boolean(registrationKey), emailVerificationRequired: true });
          return;
        }

        const forwardedIp = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
        const ip = forwardedIp || req.socket.remoteAddress || 'unknown';
        const attemptKey = `${ip}:${url.pathname}`;
        const limitedAuthRoutes = [
          '/api/register', '/api/login', '/api/verify-email', '/api/resend-verification', '/api/forgot-password', '/api/reset-password',
        ];
        if (limitedAuthRoutes.includes(url.pathname) && method === 'POST') {
          const now = Date.now();
          if (now - lastAuthCleanup >= 60 * 1000) {
            for (const [key, bucket] of authAttempts) {
              if (now - bucket.start >= AUTH_WINDOW_MS) authAttempts.delete(key);
            }
            lastAuthCleanup = now;
          }
          if (!authAttempts.has(attemptKey) && authAttempts.size >= MAX_AUTH_BUCKETS) {
            sendJson(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
            return;
          }
          const previous = authAttempts.get(attemptKey);
          const attempts = previous && now - previous.start < AUTH_WINDOW_MS ? previous : { start: now, count: 0 };
          if (attempts.count >= 10) {
            sendJson(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
            return;
          }
          attempts.count++;
          authAttempts.set(attemptKey, attempts);
        }

        const secure = secureCookies ? '; Secure' : '';
        const sameSite = crossSiteCookies ? 'None' : 'Lax';
        const cookieHeaders = (token) => ({
          'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_MAX_AGE}${secure}`,
        });
        const clearCookie = {
          'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`,
        };

        if (url.pathname === '/api/register' && method === 'POST') {
          const body = await readJson(req);
          if (registrationKey && !matchesSecret(body.registrationKey, registrationKey)) {
            sendJson(res, 403, { error: 'Code d’invitation incorrect.' });
            return;
          }
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            sendJson(res, 400, { error: 'Entrez une adresse e-mail valide.' });
            return;
          }
          if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 128) {
            sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 12 caractères et au plus 128 octets.' });
            return;
          }
          try {
            const user = await database.createUser(email, password);
            const token = database.createEmailToken(user.id, 'verify_email', VERIFICATION_TTL_MS);
            let emailSent = true;
            try {
              await mailer.sendVerification({ to: user.email, url: actionUrl(req, 'verification', token) });
            } catch {
              emailSent = false;
            }
            authAttempts.delete(attemptKey);
            sendJson(res, 202, { verificationRequired: true, emailSent, email: user.email });
          } catch (error) {
            if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed: users\.email/.test(error.message)) {
              sendJson(res, 409, { error: 'Un compte existe déjà pour cette adresse e-mail.' });
              return;
            }
            throw error;
          }
          return;
        }

        if (url.pathname === '/api/login' && method === 'POST') {
          const body = await readJson(req);
          const email = String(body.email || '').trim().toLowerCase();
          const password = String(body.password || '');
          if (Buffer.byteLength(password, 'utf8') > 128) {
            sendJson(res, 401, { error: 'Adresse e-mail ou mot de passe incorrect.' });
            return;
          }
          const user = database.findUserByEmail(email);
          if (!user || !(await database.verifyPassword(user, password))) {
            sendJson(res, 401, { error: 'Adresse e-mail ou mot de passe incorrect.' });
            return;
          }
          if (!user.email_verified_at) {
            sendJson(res, 403, { error: 'Validez votre adresse e-mail avant de vous connecter.' });
            return;
          }
          const session = database.createSession(user.id);
          authAttempts.delete(attemptKey);
          sendJson(res, 200, { user: { id: user.id, email: user.email } }, cookieHeaders(session.token));
          return;
        }

        if (url.pathname === '/api/verify-email' && method === 'POST') {
          const body = await readJson(req);
          const user = database.verifyEmailToken(String(body.token || ''));
          if (!user) {
            sendJson(res, 400, { error: 'Lien de validation invalide ou expiré. Demandez un nouveau lien.' });
            return;
          }
          const session = database.createSession(user.id);
          authAttempts.delete(attemptKey);
          sendJson(res, 200, { user }, cookieHeaders(session.token));
          return;
        }

        if (url.pathname === '/api/resend-verification' && method === 'POST') {
          const body = await readJson(req);
          const email = String(body.email || '').trim().toLowerCase();
          const user = database.findUserByEmail(email);
          if (user && !user.email_verified_at) {
            const token = database.createEmailToken(user.id, 'verify_email', VERIFICATION_TTL_MS);
            try {
              await mailer.sendVerification({ to: user.email, url: actionUrl(req, 'verification', token) });
            } catch {
              // Réponse identique pour éviter de révéler les adresses enregistrées.
            }
          }
          sendJson(res, 202, { message: 'Si un compte non validé correspond à cette adresse, un lien lui sera envoyé.' });
          return;
        }

        if (url.pathname === '/api/forgot-password' && method === 'POST') {
          const body = await readJson(req);
          const email = String(body.email || '').trim().toLowerCase();
          const user = database.findUserByEmail(email);
          if (user?.email_verified_at) {
            const token = database.createEmailToken(user.id, 'reset_password', PASSWORD_RESET_TTL_MS);
            try {
              await mailer.sendPasswordReset({ to: user.email, url: actionUrl(req, 'reset-password', token) });
            } catch {
              // Réponse identique pour éviter de révéler les adresses enregistrées.
            }
          }
          sendJson(res, 202, { message: 'Si un compte validé correspond à cette adresse, un lien de récupération lui sera envoyé.' });
          return;
        }

        if (url.pathname === '/api/reset-password' && method === 'POST') {
          const body = await readJson(req);
          const password = String(body.password || '');
          if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 128) {
            sendJson(res, 400, { error: 'Le mot de passe doit contenir au moins 12 caractères et au plus 128 octets.' });
            return;
          }
          const user = await database.resetPasswordWithToken(String(body.token || ''), password);
          if (!user) {
            sendJson(res, 400, { error: 'Lien de récupération invalide ou expiré. Demandez un nouveau lien.' });
            return;
          }
          authAttempts.delete(attemptKey);
          sendJson(res, 200, { message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.' });
          return;
        }

        const token = cookieValue(req, SESSION_COOKIE);
        const user = database.findSession(token);
        if (url.pathname === '/api/logout' && method === 'POST') {
          database.deleteSession(token);
          sendJson(res, 200, { ok: true }, clearCookie);
          return;
        }
        if (!user) {
          sendJson(res, 401, { error: 'Connexion requise.' });
          return;
        }

        if (url.pathname === '/api/session' && method === 'GET') {
          sendJson(res, 200, { user, ...database.readState(user.id) });
          return;
        }
        if (url.pathname === '/api/state' && method === 'GET') {
          sendJson(res, 200, database.readState(user.id));
          return;
        }
        if (url.pathname === '/api/state' && method === 'PUT') {
          const body = await readJson(req);
          const result = database.writeState(user.id, body.state, body.revision);
          if (result.error === 'invalid') {
            sendJson(res, 400, { error: 'État de tontine invalide.' });
            return;
          }
          if (result.error === 'too_large') {
            sendJson(res, 413, { error: 'Les données dépassent la taille maximale.' });
            return;
          }
          if (result.error === 'conflict') {
            sendJson(res, 409, { error: 'Les données ont été modifiées depuis un autre appareil.', revision: result.revision });
            return;
          }
          sendJson(res, 200, result);
          return;
        }
        sendJson(res, 404, { error: 'Route API introuvable.' });
        return;
      }

      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel === '' || rel.endsWith(sep)) rel += 'index.html';
      const top = rel.split(sep)[0];
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT + sep) || !PUBLIC.includes(top)) {
        res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
        return;
      }
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(body);
    } catch (error) {
      if (req.url?.startsWith('/api/')) {
        const status = error.status || 500;
        sendJson(res, status, { error: status < 500 ? error.message : 'Erreur interne du serveur.' });
        return;
      }
      res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
    }
  });
  server.on('close', () => database.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, HOST, () => console.log(`TontinePro : http://localhost:${PORT} (${HOST})`));
}
