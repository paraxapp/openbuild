import React, { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { api, getToken, setToken, type ProjectData } from './api';
import {
  parseHtmlElements, patchHtmlText, addHtmlElement, buildSrcDoc,
  parseCss, setCssProp, workflowToTS, mergeWorkflowGen, exportZip
} from './builder';
import WorkflowEditor from './components/WorkflowEditor';

type Tab = 'vhtml' | 'chtml' | 'vcss' | 'ccss' | 'js' | 'ts' | 'flow' | 'preview';

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState('My site');
  const [storage, setStorage] = useState('neon');
  const [open, setOpen] = useState<{ storage: string; id: number } | null>(null);
  const [data, setData] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>('vhtml');
  const [selEl, setSelEl] = useState(0);
  const [selCss, setSelCss] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (getToken()) api.me().then((r) => setUser(r.user)).catch(() => setToken(null));
  }, []);

  async function refresh() {
    const r = await api.listProjects();
    setProjects(r.projects);
  }
  useEffect(() => { if (user) refresh().catch((e) => setMsg(e.message)); }, [user]);

  async function auth(mode: 'login' | 'register') {
    try {
      const r = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      setToken(r.token); setUser(r.user); setMsg(`logged in (${r.authDb})`);
    } catch (e: any) { setMsg(e.message); }
  }

  async function create() {
    try {
      const r = await api.createProject(name, storage); // per-project choice
      setMsg(`saved to ${storage}`);
      await refresh();
      setOpen({ storage, id: r.project.id });
      setData(r.data);
    } catch (e: any) { setMsg(e.message); }
  }

  async function openProject(p: any) {
    const r = await api.getProject(p.storage || p.storage_provider, p.id);
    setOpen({ storage: p.storage || p.storage_provider, id: p.id });
    setData(r.data);
    setTab('vhtml');
  }

  async function save() {
    if (!open || !data) return;
    try {
      await api.saveProject(open.storage, open.id, data.name, data);
      setMsg(`saved to ${open.storage} ✓`);
      refresh();
    } catch (e: any) { setMsg(e.message); }
  }

  const els = useMemo(() => (data ? parseHtmlElements(data.html) : []), [data?.html]);
  const rules = useMemo(() => parseCss(data?.css || ''), [data?.css]);
  useEffect(() => { if (!selCss && rules[0]) setSelCss(rules[0].selector); }, [rules]);

  function regenWorkflow(next = data) {
    if (!next) return;
    const fresh = workflowToTS(next.workflow.nodes);
    const mergedTs = mergeWorkflowGen(next.ts, fresh);
    setData({ ...next, ts: mergedTs, workflowGen: fresh });
  }

  async function download() {
    if (!data) return;
    const blob = await exportZip(data); // free download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.name || 'openbuild'}.zip`;
    a.click();
  }

  if (!user) {
    return (
      <div className="wrap">
        <div className="card">
          <h2>OpenBuild — sign in</h2>
          <p>Email-only auth for now. Projects save per-project to Neon or Supabase.</p>
          <div className="row">
            <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input placeholder="password (min 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={() => auth('login')}>Login</button>
            <button className="ghost" onClick={() => auth('register')}>Register</button>
          </div>
          {msg && <p>{msg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="row">
        <h2 style={{ margin: 0 }}>OpenBuild</h2>
        <span className="badge">{user.email}</span>
        <button className="ghost" onClick={() => { setToken(null); setUser(null); setData(null); setOpen(null); }}>logout</button>
        <span style={{ flex: 1 }} />
        {open && data && (<><button onClick={save}>Save to {open.storage}</button><button className="ghost" onClick={download}>Download zip (free)</button></>)}
      </div>
      {msg && <p>{msg}</p>}

      {!open || !data ? (
        <div className="card">
          <h3>Projects</h3>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="project name" />
            <select value={storage} onChange={(e) => setStorage(e.target.value)}>
              <option value="neon">save to Neon</option>
              <option value="supabase">save to Supabase</option>
            </select>
            <button onClick={create}>New project</button>
            <button className="ghost" onClick={refresh}>Refresh</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {projects.map((p) => (
              <div key={`${p.storage || p.storage_provider}-${p.id}`} className="row" style={{ marginBottom: 6 }}>
                <span className="badge">{p.storage || p.storage_provider}</span>
                <b>{p.name}</b><span>#{p.id}</span>
                <button className="ghost" onClick={() => openProject(p)}>Open</button>
              </div>
            ))}
            {projects.length === 0 && <p>No projects yet — create one.</p>}
          </div>
        </div>
      ) : (
        <div>
          <div className="row">
            <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
            <span className="badge">storage: {open.storage} (per-project)</span>
            <button className="ghost" onClick={() => { setOpen(null); setData(null); }}>← back</button>
          </div>
          <div className="tabs">
            {([['vhtml', 'Visual HTML'], ['chtml', 'Code HTML'], ['vcss', 'Visual CSS'], ['ccss', 'Code CSS'], ['js', 'JS'], ['ts', 'TS'], ['flow', 'Workflow'], ['preview', 'Preview']] as [Tab, string][]).map(([t, l]) => (
              <button key={t} className={tab === t ? 'active' : 'ghost'} onClick={() => setTab(t)}>{l}</button>
            ))}
          </div>

          {tab === 'vhtml' && (
            <div className="grid2">
              <div className="card list">
                <h4>Elements (click → edit code)</h4>
                {els.map((el, i) => (
                  <button key={i} className={i === selEl ? '' : 'ghost'} onClick={() => setSelEl(i)}>{el.tag} — {el.text || el.path}</button>
                ))}
                <div className="row">
                  {['h1', 'p', 'button', 'div'].map((t) => (
                    <button key={t} className="ghost" onClick={() => setData({ ...data, html: addHtmlElement(data.html, t) })}>+ {t}</button>
                  ))}
                </div>
              </div>
              <div className="card">
                <h4>Edit text (patches HTML code — code is truth)</h4>
                <input style={{ width: '100%' }} value={els[selEl]?.text || ''} onChange={(e) => setData({ ...data, html: patchHtmlText(data.html, selEl, e.target.value) })} />
                <h4>Live HTML code</h4>
                <pre className="code">{data.html}</pre>
              </div>
            </div>
          )}

          {tab === 'chtml' && (
            <div className="card">
              <Editor height="400px" language="html" value={data.html} onChange={(v) => setData({ ...data, html: v || '' })} />
            </div>
          )}

          {tab === 'vcss' && (
            <div className="grid2">
              <div className="card">
                <h4>Selectors</h4>
                {rules.map((r) => (
                  <button key={r.selector} className={selCss === r.selector ? '' : 'ghost'} style={{ display: 'block', width: '100%', marginBottom: 6 }} onClick={() => setSelCss(r.selector)}>{r.selector}</button>
                ))}
              </div>
              <div className="card">
                <h4>{selCss || 'pick selector'} (sliders → patch CSS)</h4>
                {['color', 'background', 'font-size', 'padding', 'margin', 'display'].map((k) => (
                  <div key={k} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ width: 100 }}>{k}</span>
                    <input value={rules.find((r) => r.selector === selCss)?.props[k] || ''} onChange={(e) => data && selCss && setData({ ...data, css: setCssProp(data.css, selCss, k, e.target.value) })} placeholder={k === 'color' ? '#111' : k} />
                  </div>
                ))}
                <pre className="code">{data.css}</pre>
              </div>
            </div>
          )}

          {tab === 'ccss' && (
            <div className="card"><Editor height="400px" language="css" value={data.css} onChange={(v) => setData({ ...data, css: v || '' })} /></div>
          )}
          {tab === 'js' && (
            <div className="card"><Editor height="400px" language="javascript" value={data.js} onChange={(v) => setData({ ...data, js: v || '' })} /></div>
          )}
          {tab === 'ts' && (
            <div className="card">
              <p>Hand-edit TS precisely. Workflow regen preserves code outside <code>// @visual-begin … @visual-end</code>.</p>
              <Editor height="400px" language="typescript" value={data.ts} onChange={(v) => setData({ ...data, ts: v || '' })} />
            </div>
          )}

          {tab === 'flow' && (
            <div className="card">
              <WorkflowEditor
                nodes={data.workflow.nodes} edges={data.workflow.edges}
                onChange={(n, e) => { const next = { ...data, workflow: { nodes: n, edges: e } }; regenWorkflow(next); }}
              />
              <h4>Generated workflow.gen.ts → TypeScript</h4>
              <pre className="code">{data.workflowGen}</pre>
            </div>
          )}

          {tab === 'preview' && (
            <div className="card">
              <iframe className="preview" title="preview" srcDoc={buildSrcDoc(data)} sandbox="allow-scripts" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
