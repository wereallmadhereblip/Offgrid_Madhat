import http from 'node:http';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const dataDir = process.env.OFFGRID_DATA_DIR || path.join(root, 'data');
const host = process.env.OFFGRID_HOST || '127.0.0.1';
const port = Number(process.env.OFFGRID_PORT || 4173);

const checkInterval = 24 * 60 * 60 * 1000;
const sessionLifetime = 12 * 60 * 60 * 1000;
const maxBody = 16 * 1024;

// Only apps that expose their installed version over HTTP can be checked.
// Others are listed in the dashboard without update information.
const checkers = {
  media: {
    defaultUrl: 'http://localhost:8096',
    versionPath: '/System/Info/Public',
    readVersion: body => body.Version,
    repo: 'jellyfin/jellyfin',
    releaseUrl: 'https://jellyfin.org/downloads/',
  },
  ai: {
    defaultUrl: 'http://localhost:8080',
    versionPath: '/api/version',
    readVersion: body => body.version,
    repo: 'open-webui/open-webui',
    releaseUrl: 'https://github.com/open-webui/open-webui/releases/latest',
  },
  education: {
    defaultUrl: 'http://localhost:8082',
    versionPath: '/api/public/info/',
    readVersion: body => body.kolibri_version,
    repo: 'learningequality/kolibri',
    releaseUrl: 'https://learningequality.org/download/',
  },
};
const serviceIds = ['library', 'education', 'ai', 'maps', 'tools', 'notes', 'media', 'comms'];

const sessions = new Map();
const failures = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporary, file);
}

const adminFile = path.join(dataDir, 'admin.json');
const servicesFile = path.join(dataDir, 'services.json');
const updatesFile = path.join(dataDir, 'updates.json');

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

const defaultPassword = 'madhat';
const minPasswordLength = 8;

async function storePassword(value, isDefault) {
  const salt = randomBytes(16);
  await writeJson(adminFile, { salt: salt.toString('base64'), hash: (await hashPassword(value, salt)).toString('base64'), isDefault });
}

async function ensureAdmin() {
  const fromEnvironment = process.env.OFFGRID_ADMIN_PASSWORD;
  if (fromEnvironment) {
    if (fromEnvironment.length < minPasswordLength) throw new Error(`OFFGRID_ADMIN_PASSWORD must be at least ${minPasswordLength} characters.`);
    await storePassword(fromEnvironment, false);
    return;
  }
  if (await readJson(adminFile, null)) return;
  await storePassword(defaultPassword, true);
  console.log(`\nAdmin password is the default "${defaultPassword}". Change it in the dashboard settings (admin lock icon > Change admin password).\n`);
}

async function verifyPassword(password) {
  const credential = await readJson(adminFile, null);
  if (!credential) return false;
  const expected = Buffer.from(credential.hash, 'base64');
  const actual = await hashPassword(password, Buffer.from(credential.salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validAddress(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function newerVersion(latest, installed) {
  const parse = value => String(value).replace(/^v/i, '').split(/[.+-]/).map(part => Number.parseInt(part, 10) || 0);
  const a = parse(latest);
  const b = parse(installed);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('Response too large');
  return JSON.parse(text);
}

async function checkService(id, addresses) {
  const checker = checkers[id];
  const base = addresses[id] || checker.defaultUrl;
  const result = { releaseUrl: checker.releaseUrl, installed: null, latest: null, updateAvailable: false, status: 'ok' };

  try {
    const installed = checker.readVersion(await fetchJson(new URL(checker.versionPath, base).href));
    if (typeof installed !== 'string' || !installed) throw new Error('No version reported');
    result.installed = installed;
  } catch {
    return { ...result, status: 'unreachable' };
  }

  try {
    const release = await fetchJson(`https://api.github.com/repos/${checker.repo}/releases/latest`, { 'user-agent': 'offgrid-madhat' });
    if (typeof release.tag_name !== 'string') throw new Error('No release tag');
    result.latest = release.tag_name.replace(/^v/i, '');
    result.updateAvailable = newerVersion(result.latest, result.installed);
  } catch {
    result.status = 'upstream-unavailable';
  }
  return result;
}

let checking = null;

function runUpdateCheck() {
  checking ||= (async () => {
    const saved = await readJson(servicesFile, {});
    const results = {};
    await Promise.all(Object.keys(checkers).map(async id => {
      results[id] = await checkService(id, saved);
    }));
    const report = { checkedAt: new Date().toISOString(), results };
    await writeJson(updatesFile, report);
    return report;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

async function scheduleChecks() {
  const tick = async () => {
    try {
      const report = await readJson(updatesFile, null);
      if (!report || Date.now() - Date.parse(report.checkedAt) >= checkInterval) await runUpdateCheck();
    } catch (error) {
      console.error('Update check failed:', error.message);
    }
  };
  await tick();
  setInterval(tick, 15 * 60 * 1000);
}

function clientKey(request) {
  return request.socket.remoteAddress || 'unknown';
}

function requireAdmin(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer /, '');
  const expires = sessions.get(token);
  if (!token || !expires || expires < Date.now()) {
    sessions.delete(token);
    throw new HttpError(401, 'Admin login required.');
  }
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBody) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function handleApi(request, response, pathname) {
  if (pathname === '/api/services' && request.method === 'GET') {
    return sendJson(response, 200, await readJson(servicesFile, {}));
  }

  if (pathname === '/api/services' && request.method === 'PUT') {
    requireAdmin(request);
    const body = await readBody(request);
    const cleaned = {};
    for (const id of serviceIds) {
      const value = typeof body[id] === 'string' ? body[id].trim() : '';
      if (!validAddress(value)) throw new HttpError(400, 'Enter a complete HTTP or HTTPS address for every service.');
      cleaned[id] = value;
    }
    await writeJson(servicesFile, cleaned);
    return sendJson(response, 200, cleaned);
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    const key = clientKey(request);
    const record = failures.get(key);
    if (record && record.count >= 5 && record.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
    const { password } = await readBody(request);
    if (typeof password !== 'string' || !(await verifyPassword(password))) {
      failures.set(key, { count: (record && record.until > Date.now() ? record.count : 0) + 1, until: Date.now() + 60_000 });
      throw new HttpError(401, 'Incorrect admin password.');
    }
    failures.delete(key);
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + sessionLifetime);
    const credential = await readJson(adminFile, null);
    return sendJson(response, 200, { token, defaultPassword: Boolean(credential && credential.isDefault) });
  }

  if (pathname === '/api/password' && request.method === 'PUT') {
    requireAdmin(request);
    const key = clientKey(request);
    const record = failures.get(key);
    if (record && record.count >= 5 && record.until > Date.now()) throw new HttpError(429, 'Too many attempts. Try again in a minute.');
    const { current, next } = await readBody(request);
    if (typeof current !== 'string' || !(await verifyPassword(current))) {
      failures.set(key, { count: (record && record.until > Date.now() ? record.count : 0) + 1, until: Date.now() + 60_000 });
      throw new HttpError(401, 'Current password is incorrect.');
    }
    if (typeof next !== 'string' || next.length < minPasswordLength || next.length > 200) throw new HttpError(400, `New password must be ${minPasswordLength}-200 characters.`);
    if (next === defaultPassword) throw new HttpError(400, 'Choose a password other than the default.');
    failures.delete(key);
    await storePassword(next, false);
    const own = (request.headers.authorization || '').replace(/^Bearer /, '');
    for (const token of [...sessions.keys()]) if (token !== own) sessions.delete(token);
    return sendJson(response, 200, {});
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    sessions.delete((request.headers.authorization || '').replace(/^Bearer /, ''));
    return sendJson(response, 200, {});
  }

  if (pathname === '/api/updates' && request.method === 'GET') {
    requireAdmin(request);
    return sendJson(response, 200, (await readJson(updatesFile, null)) || { checkedAt: null, results: {} });
  }

  if (pathname === '/api/updates/check' && request.method === 'POST') {
    requireAdmin(request);
    return sendJson(response, 200, await runUpdateCheck());
  }

  throw new HttpError(404, 'Not found.');
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function serveStatic(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(distDir, relative);
  if (file !== distDir && !file.startsWith(distDir + path.sep)) throw new HttpError(404, 'Not found.');
  try {
    const content = await fs.readFile(file);
    response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    throw new HttpError(404, 'Not found.');
  }
}

const server = http.createServer(async (request, response) => {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-frame-options', 'DENY');
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname.startsWith('/api/')) await handleApi(request, response, pathname);
    else if (request.method === 'GET' || request.method === 'HEAD') await serveStatic(response, pathname);
    else throw new HttpError(405, 'Method not allowed.');
  } catch (error) {
    if (!(error instanceof HttpError)) console.error(error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : 'Internal server error.' });
  }
});

if (process.argv.includes('--set-admin-password')) {
  if (!process.env.OFFGRID_ADMIN_PASSWORD) {
    console.error('Set OFFGRID_ADMIN_PASSWORD to the new password (at least 8 characters).');
    process.exit(1);
  }
  await ensureAdmin();
  process.exit(0);
}

await ensureAdmin();
server.listen(port, host, () => {
  console.log(`Offgrid Madhat running at http://${host}:${port}`);
  scheduleChecks();
});
