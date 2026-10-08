import { signToken, verifyToken } from './_lib.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    // token check
    const h = req.headers?.authorization || '';
    return res.status(200).json({ ok: verifyToken(h.startsWith('Bearer ') ? h.slice(7) : undefined) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminId = process.env.ADMIN_ID;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminId || !adminPassword) {
    return res.status(500).json({ error: 'ADMIN_ID / ADMIN_PASSWORD env vars are not set' });
  }
  const { id, password } = req.body || {};
  if (id === adminId && password === adminPassword) {
    return res.status(200).json({ ok: true, token: signToken() });
  }
  return res.status(401).json({ ok: false, error: 'Incorrect ID or Password!' });
}
