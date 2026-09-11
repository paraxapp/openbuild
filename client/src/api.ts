const KEY = 'openbuild_token';
const LS_PROJECTS = 'openbuild_projects_v1';

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
};

export type ProjectData = {
  name: string;
  html: string;
  css: string;
  js: string;
  ts: string;
  workflow: { nodes: WFNode[]; edges: WFEdge[] };
  workflowGen?: string;
};

export type WFNode = { id: string; type: 'trigger' | 'log' | 'setText' | 'fetch'; label: string; detail?: string };
export type WFEdge = { from: string; to: string };

export function defaultProjectData(name: string): ProjectData {
  const ts = `export function onCta(): void {\n  // @visual-node cta-log\n  console.log('cta clicked');\n}`;
  return {
    name,
    html: `<main class="page">\n  <h1 data-ob="title">Hello OpenBuild</h1>\n  <p data-ob="sub">Edit visually or in code — code is truth.</p>\n  <button data-ob="cta" onclick="onCta()">Click me</button>\n</main>`,
    css: `.page { font-family: system-ui; padding: 24px; }\n.page h1 { color: #111; }\n.page button { padding: 8px 14px; }`,
    js: `function onCta() {\n  // @visual-node cta-log\n  console.log('cta clicked');\n}`,
    ts,
    workflow: {
      nodes: [
        { id: 'trigger-cta', type: 'trigger', label: 'onCta' },
        { id: 'cta-log', type: 'log', label: 'console.log cta' }
      ],
      edges: [{ from: 'trigger-cta', to: 'cta-log' }]
    },
    workflowGen: `// AUTO-GENERATED from visual workflow.\n// @visual-begin\nexport function onCta(): void {\n  // @visual-node trigger-cta\n  console.log('console.log cta'); // @visual-node cta-log\n}\n// @visual-end`
  };
}

// ---- Local projects (no DB projects). Stored in localStorage per browser.
export type LocalProject = { id: string; updatedAt: string; data: ProjectData };

export function listLocal(): LocalProject[] {
  try {
    const raw = localStorage.getItem(LS_PROJECTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeLocal(all: LocalProject[]) {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(all.slice(0, 100)));
}

export function saveLocal(id: string, data: ProjectData): LocalProject[] {
  const all = listLocal();
  const i = all.findIndex((p) => p.id === id);
  const rec = { id, updatedAt: new Date().toISOString(), data };
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  writeLocal(all);
  return all;
}

export function createLocal(name: string): LocalProject {
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
  const rec = { id, updatedAt: new Date().toISOString(), data: defaultProjectData(name) };
  const all = [rec, ...listLocal()];
  writeLocal(all);
  return rec;
}

export function deleteLocal(id: string): LocalProject[] {
  const all = listLocal().filter((p) => p.id !== id);
  writeLocal(all);
  return all;
}
