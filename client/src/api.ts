const KEY = 'openbuild_token';

export function getToken() { return localStorage.getItem(KEY); }
export function setToken(t: string | null) { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); }

async function req(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(path, { ...opts, headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `request failed: ${r.status}`);
  return body;
}

export const api = {
  register: (email: string, password: string) => req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/api/auth/me'),
  listProjects: () => req('/api/projects'),
  createProject: (name: string, storage: string) => req('/api/projects', { method: 'POST', body: JSON.stringify({ name, storage }) }),
  getProject: (storage: string, id: number) => req(`/api/projects/${storage}/${id}`),
  saveProject: (storage: string, id: number, name: string, data: any) =>
    req(`/api/projects/${storage}/${id}`, { method: 'PUT', body: JSON.stringify({ name, data }) }),
};

export type ProjectData = {
  name: string;
  html: string;
  css: string;
  js: string;
  ts: string;
  workflow: { nodes: WFNode[]; edges: WFEdge[] };
  workflowGen?: string;
  owner_email?: string;
};

export type WFNode = { id: string; type: 'trigger' | 'log' | 'setText' | 'fetch'; label: string; detail?: string };
export type WFEdge = { from: string; to: string };
