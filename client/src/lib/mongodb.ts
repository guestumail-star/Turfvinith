import { Match, Player, Team } from '../types';
import { safeStorage } from '../utils/storage';

const TOKEN_KEY = 'cricket-admin-token';

export const getToken = () => safeStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => safeStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => safeStorage.removeItem(TOKEN_KEY);

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiLogin(id: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      setToken(data.token);
      return { ok: true };
    }
    return { ok: false, error: data.error || 'Login failed' };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function apiCheckToken(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    const res = await fetch('/api/login', { headers: authHeaders(), cache: 'no-store' });
    const data = await res.json();
    return !!data.ok;
  } catch {
    return true; // offline - keep session, server still validates writes
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return res.json();
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to save (${res.status})`);
}

async function del(path: string, id: string) {
  const res = await fetch(`${path}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
}

export const apiGetPlayers = () => get<Player[]>('/api/players');
export const apiSavePlayer = (p: Player) => post('/api/players', p);
export const apiDeletePlayer = (id: string) => del('/api/players', id);

export const apiGetTeams = () => get<Team[]>('/api/teams');
export const apiSaveTeam = (t: Team) => post('/api/teams', t);
export const apiDeleteTeam = (id: string) => del('/api/teams', id);

export const apiGetMatches = () => get<Match[]>('/api/matches');
export const apiSaveMatch = (m: Match) => post('/api/matches', m);
export const apiDeleteMatch = (id: string) => del('/api/matches', id);
