import { createServer } from 'node:http';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, '..');
const apiDir = path.join(root, 'api');
const port = Number(process.env.API_PORT || process.env.PORT || 3001);

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

for (const base of [repoRoot, root]) {
  loadEnvFile(path.join(base, '.env'));
  loadEnvFile(path.join(base, '.env.local'));
}

// Node's DNS resolver can fall back to 127.0.0.1, which does not answer
// MongoDB Atlas SRV queries (ECONNREFUSED). Use public resolvers instead.
function applyDnsServers() {
  const servers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  dns.setServers(servers);
  return servers;
}

const dnsServers = applyDnsServers();
dns.setDefaultResultOrder('ipv4first');

function decorate(req, res) {
  const url = new URL(req.url, 'http://localhost');
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
}

async function readJsonBody(req) {
  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function loadHandler(name) {
  const file = path.join(apiDir, `${name}.ts`);
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return mod.default;
}

async function apiHandler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  const name = url.pathname.slice(5).replace(/\.(ts|js)$/, '');
  const file = path.join(apiDir, `${name}.ts`);
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: `No API route for ${url.pathname}` }));
  }

  try {
    decorate(req, res);
    req.body = await readJsonBody(req);
    const handler = await loadHandler(name);
    if (typeof handler !== 'function') throw new Error(`${name}.ts has no default handler export`);
    await handler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
}

const server = createServer((req, res) => {
  apiHandler(req, res).catch((err) => {
    res.statusCode = 500;
    res.end(String(err?.stack || err));
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  Port ${port} is already in use.\n` +
        `  Stop the other dev server (Ctrl+C in the terminal running "npm run dev"),\n` +
        `  or run on another port: API_PORT=3002 npm run dev\n`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`\n  API server ready on http://localhost:${port}`);
  console.log(`  Routes: /api/login /api/players /api/teams /api/matches`);
  console.log(`  DNS servers: ${dnsServers.join(', ')}\n`);
});
