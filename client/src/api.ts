// No backend, no DB. Local auth (browser-only) + local multi-page projects + .open files.
const LS_USERS = 'openbuild_users_v1';
const LS_SESSION = 'openbuild_session_v1';
const projKey = (email: string) => `openbuild_projects_v1_${email.toLowerCase()}`;

export type ProjectData = {
  name: string;
  pages: Page[];
  activePageId: string;
  js: string;
  ts: string;
  workflow: { nodes: WFNode[]; edges: WFEdge[] };
  workflowGen?: string;
  // legacy single-page fields (migrated on load)
  html?: string;
  css?: string;
};

export type Page = { id: string; name: string; file: string; html: string; css: string };
export type WFNode = { id: string; type: 'trigger' | 'log' | 'setText' | 'fetch'; label: string; detail?: string };
export type WFEdge = { from: string; to: string };

// ---------- local auth (demo-grade: per-browser accounts, SHA-256 hash) ----------
type StoredUser = { email: string; passHash: string; createdAt: string };

function readUsers(): StoredUser[] {
  try { const a = JSON.parse(localStorage.getItem(LS_USERS) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function writeUsers(u: StoredUser[]) { localStorage.setItem(LS_USERS, JSON.stringify(u)); }

async function sha256(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `f${(h >>> 0).toString(16)}`;
  }
}

export function currentUser(): string | null { return localStorage.getItem(LS_SESSION); }

export async function registerLocal(email: string, password: string): Promise<string> {
  email = email.trim().toLowerCase();
  if (!email || password.length < 8) throw new Error('email and password (min 8) required');
  const users = readUsers();
  if (users.some((u) => u.email === email)) throw new Error('email already registered on this browser');
  users.push({ email, passHash: await sha256(`ob:${email}:${password}`), createdAt: new Date().toISOString() });
  writeUsers(users);
  localStorage.setItem(LS_SESSION, email);
  return email;
}

export async function loginLocal(email: string, password: string): Promise<string> {
  email = email.trim().toLowerCase();
  const u = readUsers().find((x) => x.email === email);
  if (!u) throw new Error('no account on this browser — register first');
  if (u.passHash !== (await sha256(`ob:${email}:${password}`))) throw new Error('wrong password');
  localStorage.setItem(LS_SESSION, email);
  return email;
}

export function logoutLocal() { localStorage.removeItem(LS_SESSION); }

// ---------- pages ----------
let n = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}${(n++ % 99)}`;

export function newPage(name: string, file: string): Page {
  return {
    id: nid('pg'), name, file,
    html: `<main class="page">\n  <h1 data-ob="title">${name}</h1>\n  <p data-ob="sub">Drag blocks here — code updates live.</p>\n  <button data-ob="cta" onclick="onCta()">Click me</button>\n</main>`,
    css: `.page { font-family: system-ui; padding: 24px; max-width: 720px; margin: 0 auto; }\n.page h1 { color: #111; }\n.page button { padding: 8px 14px; }`
  };
}

export function defaultProjectData(name: string): ProjectData {
  const home = newPage('Home', 'index.html');
  const about = newPage('About', 'about.html');
  const ts = `export function onCta(): void {\n  // @visual-node cta-log\n  console.log('cta clicked');\n}`;
  return {
    name, pages: [home, about], activePageId: home.id,
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

export function migrateProject(d: any): ProjectData {
  if (d && Array.isArray(d.pages) && d.pages.length) {
    if (!d.pages.find((p: Page) => p.id === d.activePageId)) d.activePageId = d.pages[0].id;
    return d as ProjectData;
  }
  const base = defaultProjectData(d?.name || 'Untitled');
  if (typeof d?.html === 'string') base.pages[0].html = d.html;
  if (typeof d?.css === 'string') base.pages[0].css = d.css;
  if (typeof d?.js === 'string') base.js = d.js;
  if (typeof d?.ts === 'string') base.ts = d.ts;
  if (d?.workflow) base.workflow = d.workflow;
  if (typeof d?.workflowGen === 'string') base.workflowGen = d.workflowGen;
  if (typeof d?.name === 'string') base.name = d.name;
  return base;
}

export function activePage(d: ProjectData): Page {
  return d.pages.find((p) => p.id === d.activePageId) || d.pages[0];
}

export function setActivePage(d: ProjectData, html: string, css: string): ProjectData {
  const pages = d.pages.map((p) => (p.id === d.activePageId ? { ...p, html, css } : p));
  return { ...d, pages };
}

// ---------- local projects per user ----------
export type LocalProject = { id: string; updatedAt: string; data: ProjectData };

export function listLocal(email: string): LocalProject[] {
  try {
    const arr = JSON.parse(localStorage.getItem(projKey(email)) || '[]');
    const out = (Array.isArray(arr) ? arr : []).map((p: any) => ({ ...p, data: migrateProject(p.data) }));
    return out;
  } catch { return []; }
}

function writeLocal(email: string, all: LocalProject[]) {
  localStorage.setItem(projKey(email), JSON.stringify(all.slice(0, 100)));
}

export function saveLocal(email: string, id: string, data: ProjectData): LocalProject[] {
  const all = listLocal(email);
  const i = all.findIndex((p) => p.id === id);
  const rec = { id, updatedAt: new Date().toISOString(), data };
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  writeLocal(email, all);
  return all;
}

export function createLocal(email: string, name: string): LocalProject {
  const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
  const rec = { id, updatedAt: new Date().toISOString(), data: defaultProjectData(name) };
  writeLocal(email, [rec, ...listLocal(email)]);
  return rec;
}

export function deleteLocal(email: string, id: string): LocalProject[] {
  const all = listLocal(email).filter((p) => p.id !== id);
  writeLocal(email, all);
  return all;
}
