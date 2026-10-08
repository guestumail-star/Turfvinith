import { MongoClient, Db } from 'mongodb';
import crypto from 'crypto';

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

const log = (msg: string, ...rest: unknown[]) => console.log(`[mongodb] ${msg}`, ...rest);

export function maskUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@]+)@/, (_m, user: string) => `//${user}:***@`);
}

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    log('ERROR MONGODB_URI is not set');
    throw new Error('MONGODB_URI environment variable is not set');
  }
  const dbName = process.env.MONGODB_DB_NAME || 'turf_scorecards';

  if (!client) {
    if (!connecting) {
      log(`connecting to ${maskUri(uri)} db=${dbName} ...`);
      const mc = new MongoClient(uri, { maxIdleTimeMS: 5000, serverSelectionTimeoutMS: 8000 });
      mc.on('serverHeartbeatFailed', (e) => log('heartbeat failed:', e.message));
      mc.on('topologyClosed', () => log('topology closed'));
      mc.on('error', (e) => log('client error:', e.message));
      connecting = mc
        .connect()
        .then((c) => {
          client = c;
          connecting = null;
          log('connected to', dbName);
          return c;
        })
        .catch((err) => {
          connecting = null;
          log('connect FAILED:', err.message);
          throw err;
        });
    }
    await connecting;
  }

  return client.db(dbName);
}

const secret = () => process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';

export function signToken(): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const body = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token?: string): boolean {
  if (!token || !secret()) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function isAdminReq(req: any): boolean {
  const h = req.headers?.authorization || '';
  return verifyToken(h.startsWith('Bearer ') ? h.slice(7) : undefined);
}

// Generic CRUD handler for a collection (players / teams / matches)
export function crud(collection: string, sortBy?: Record<string, 1 | -1>) {
  return async (req: any, res: any) => {
    try {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      if (req.method !== 'GET' && !isAdminReq(req)) {
        return res.status(401).json({ error: 'Admin login required' });
      }
      const db = await getDb();
      const col = db.collection(collection);

      if (req.method === 'GET') {
        const cursor = col.find({}, { projection: { _id: 0 } });
        if (sortBy) cursor.sort(sortBy);
        return res.status(200).json(await cursor.toArray());
      }

      if (req.method === 'POST') {
        const item = req.body;
        if (!item || !item.id) return res.status(400).json({ error: 'id is required' });
        const { _id, ...clean } = item;
        await col.updateOne({ id: item.id }, { $set: clean }, { upsert: true });
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const id = String(req.query?.id || '');
        if (!id) return res.status(400).json({ error: 'id is required' });
        await col.deleteOne({ id });
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Server error' });
    }
  };
}
