import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  currentUser, registerLocal, loginLocal, logoutLocal,
  listLocal, saveLocal, createLocal, deleteLocal, migrateProject, activePage, setActivePage, newPage,
  type ProjectData, type LocalProject
} from './api';
import {
  parseHtmlElements, patchHtmlText, deleteHtmlElement, moveHtmlElement, dropPalette,
  buildSrcDoc, parseCss, setCssProp, workflowToTS, mergeWorkflowGen,
  exportOpen, importOpen, PALETTE, type PaletteKind
} from './builder';
import WorkflowEditor from './components/WorkflowEditor';

type Mode = 'design' | 'chtml' | 'ccss' | 'js' | 'ts' | 'flow';

export default function App() {
  const [user, setUser] = useState<string | null>(() => currentUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [name, setName] = useState('My site');
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<ProjectData | null>(null);
  const [mode, setMode] = useState<Mode>('design');
  const [selEl, setSelEl] = useState(0);
  const [selCss, setSelCss] = useState('');
  const [dragKind, setDragKind] = useState<PaletteKind | null>(null);
  const [dragEl, setDragEl] = useState<number | null>(null);
  const [overCanvas, setOverCanvas] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (user) setProjects(listLocal(user)); }, [user]);

  async function auth(kind: 'login' | 'register') {
    try {
      const u = kind === 'login' ? await loginLocal(email, password) : await registerLocal(email, password);
      setUser(u); setMsg(`welcome ${u} (local, no DB)`);
    } catch (e: any) { setMsg(e.message); }
  }

  function refresh() { if (user) setProjects(listLocal(user)); }
  function persist(d: ProjectData) {
    if (!user || !openId) return;
    setProjects(saveLocal(user, openId, d));
  }

  function create() {
    if (!user) return;
    const rec = createLocal(user, name || 'Untitled');
    setProjects(listLocal(user));
    setOpenId(rec.id); setData(rec.data); setMode('design'); setSelEl(0);
  }

  function openProject(p: LocalProject) {
    setOpenId(p.id); setData(migrateProject(p.data)); setMode('design'); setSelEl(0);
  }

  useEffect(() => {
    if (!user || !openId || !data) return;
    const t = setTimeout(() => saveLocal(user, openId, data), 700);
    return () => clearTimeout(t);
  }, [data, openId, user]);

  const page = data ? activePage(migrateProject(data)) : null;
  const els = useMemo(() => parseHtmlElements(page?.html || ''), [page?.html]);
  const rules = useMemo(() => parseCss(page?.css || ''), [page?.css]);
  useEffect(() => { if (!selCss && rules[0]) setSelCss(rules[0].selector); }, [rules, selCss]);

  function patchPage(html: string, css: string) {
    if (!data) return;
    const next = setActivePage(migrateProject(data), html, css);
    setData(next); persist(next);
  }

  function regenWorkflow(next: ProjectData) {
    const fresh = workflowToTS(next.workflow.nodes);
    const merged = { ...next, ts: mergeWorkflowGen(next.ts, fresh), workflowGen: fresh };
    setData(merged); persist(merged);
  }

  async function download() {
    if (!data) return;
    const blob = await exportOpen(data);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.name || 'openbuild').replace(/[^\w\-]+/g, '_')}.open`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  if (!user) {
    return (
      <div>
        <div className="topbar"><div className="logo">Open<span>Build</span></div><span className="badge">local auth · no DB</span></div>
        <div className="wrap">
          <div className="card auth">
            <h2>Login / Register</h2>
            <p className="hint">Browser-only accounts (no server, no Postgres). Register creates a local profile; projects stay in this browser + <code>.open</code> files.</p>
            <div className="row">
              <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input placeholder="password (min 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => auth('login')}>Login</button>
              <button className="ghost" onClick={() => auth('register')}>Register</button>
            </div>
            {msg && <p>{msg}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div className="logo">Open<span>Build</span></div>
        <span className="badge">{user}</span>
        <span className="badge">bubble-like · pages · drag &amp; drop</span>
        <span style={{ flex: 1 }} />
        {openId && data && (<>
          <button onClick={() => data && user && openId && (persist(data), setMsg('saved locally ✓'))}>Save</button>
          <button className="ghost" style={{ color: '#fff', borderColor: '#444' }} onClick={download}>Download .open</button>
        </>)}
        <button className="ghost" style={{ color: '#fff', borderColor: '#444' }} onClick={() => { logoutLocal(); setUser(null); setData(null); setOpenId(null); }}>Logout</button>
      </div>
      <div className="wrap">
        {msg && <p>{msg}</p>}
        {!openId || !data || !page ? (
          <div className="card">
            <h3>Projects</h3>
            <div className="row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="project name" />
              <button onClick={create}>New project</button>
              <button className="ghost" onClick={() => fileRef.current?.click()}>Open .open…</button>
              <input ref={fileRef} type="file" accept=".open,.zip" style={{ display: 'none' }} onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f || !user) return;
                const d = migrateProject(await importOpen(f));
                const rec = createLocal(user, d.name || f.name.replace(/\.open$/i, ''));
                setProjects(saveLocal(user, rec.id, d)); setOpenId(rec.id); setData(d); setMsg(`imported ${f.name} ✓`);
                e.target.value = '';
              }} />
            </div>
            <div style={{ marginTop: 12 }}>
              {projects.map((p) => (
                <div key={p.id} className="row" style={{ marginBottom: 6 }}>
                  <b>{p.data.name}</b><span className="hint">{p.data.pages.length} pages</span>
                  <button className="ghost" onClick={() => openProject(p)}>Open</button>
                  <button className="danger" onClick={() => user && setProjects(deleteLocal(user, p.id))}>Delete</button>
                </div>
              ))}
              {projects.length === 0 && <p className="hint">No projects — create one or open a .open file.</p>}
            </div>
          </div>
        ) : (
          <div>
            <div className="row">
              <input value={data.name} onChange={(e) => { const n = { ...migrateProject(data), name: e.target.value }; setData(n); persist(n); }} />
              <span className="badge">{data.pages.length} pages</span>
              <button className="ghost" onClick={() => { setOpenId(null); setData(null); refresh(); }}>← projects</button>
            </div>
            <div className="tabs">
              {([['design', 'Design'], ['chtml', 'HTML'], ['ccss', 'CSS'], ['js', 'JS'], ['ts', 'TS'], ['flow', 'Workflow']] as [Mode, string][]).map(([m, l]) => (
                <button key={m} className={mode === m ? 'active' : 'ghost'} onClick={() => setMode(m)}>{l}</button>
              ))}
            </div>

            {mode === 'design' && (
              <div className="studio">
                <div className="side">
                  <div className="card">
                    <h4>Pages (.html)</h4>
                    {data.pages.map((p) => (
                      <button key={p.id} className={p.id === data.activePageId ? 'pageitem active' : 'pageitem ghost'} onClick={() => { const n = { ...data, activePageId: p.id }; setData(n); persist(n); setSelEl(0); }}>
                        {p.name} · {p.file}
                      </button>
                    ))}
                    <div className="row">
                      <button className="ghost" onClick={() => {
                        const pg = newPage(`Page ${data.pages.length + 1}`, `page-${data.pages.length + 1}.html`);
                        const n = { ...data, pages: [...data.pages, pg], activePageId: pg.id }; setData(n); persist(n);
                      }}>+ page</button>
                    </div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <button className="ghost" onClick={() => {
                        const n = prompt('Rename page', page.name); if (!n) return;
                        const pages = data.pages.map((p) => (p.id === page.id ? { ...p, name: n } : p));
                        const nn = { ...data, pages }; setData(nn); persist(nn);
                      }}>rename</button>
                      <button className="danger" disabled={data.pages.length <= 1} onClick={() => {
                        const pages = data.pages.filter((p) => p.id !== page.id);
                        const nn = { ...data, pages, activePageId: pages[0].id }; setData(nn); persist(nn);
                      }}>delete page</button>
                    </div>
                  </div>
                  <div className="card">
                    <h4>Blocks (drag onto canvas)</h4>
                    <div className="palette">
                      {PALETTE.map((b) => (
                        <div key={b.kind} className="pal" draggable
                          onDragStart={(e) => { setDragKind(b.kind); e.dataTransfer.setData('text/palette', b.kind); }}
                          onDragEnd={() => setDragKind(null)}
                          onClick={() => patchPage(dropPalette(page.html, b.kind), page.css)}>
                          {b.label}
                        </div>
                      ))}
                    </div>
                    <p className="hint">Tip: drag a block onto the canvas or an element to insert it. Drag elements to reorder.</p>
                  </div>
                </div>

                <div>
                  <div className={`canvas ${overCanvas ? 'dragover' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setOverCanvas(true); }}
                    onDragLeave={() => setOverCanvas(false)}
                    onDrop={(e) => {
                      e.preventDefault(); setOverCanvas(false);
                      const kind = (e.dataTransfer.getData('text/palette') as any) || dragKind;
                      const elIdx = e.dataTransfer.getData('text/element');
                      if (kind) patchPage(dropPalette(page.html, kind), page.css);
                      else if (elIdx !== '') {
                        const from = Number(elIdx);
                        if (!Number.isNaN(from)) patchPage(moveHtmlElement(page.html, from, els.length - 1), page.css);
                      }
                      setDragKind(null); setDragEl(null);
                    }}>
                    <iframe className="preview" title="canvas" srcDoc={buildSrcDoc(data, page.id)} sandbox="allow-scripts" />
                    <div className="drop-hint">Drop blocks here · live preview of {page.file} · code updates instantly (code is truth)</div>
                  </div>
                  <div className="card">
                    <h4>Elements on {page.name} (drag to reorder · click to edit)</h4>
                    {els.map((el, i) => (
                      <div key={i} className={i === selEl ? 'el active' : 'el ghost'}
                        draggable
                        onDragStart={(e) => { setDragEl(i); e.dataTransfer.setData('text/element', String(i)); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const kind = e.dataTransfer.getData('text/palette') as any;
                          if (kind) patchPage(dropPalette(page.html, kind, i), page.css);
                          else if (dragEl !== null && dragEl !== i) patchPage(moveHtmlElement(page.html, dragEl, i), page.css);
                          setDragEl(null); setDragKind(null);
                        }}
                        onClick={() => setSelEl(i)}>
                        <b>{el.tag}</b><small>{el.text || el.path}</small>
                        <span style={{ flex: 1 }} />
                        <button className="ghost" onClick={(ev) => { ev.stopPropagation(); patchPage(deleteHtmlElement(page.html, i), page.css); }}>✕</button>
                      </div>
                    ))}
                    {els.length === 0 && <p className="hint">Empty page — drag blocks in.</p>}
                  </div>
                </div>

                <div className="inspector">
                  <div className="card">
                    <h4>Inspector</h4>
                    <p className="hint">{els[selEl] ? `${els[selEl].tag} #${selEl}` : 'Select an element'}</p>
                    <input style={{ width: '100%' }} value={els[selEl]?.text || ''} placeholder="text content"
                      onChange={(e) => patchPage(patchHtmlText(page.html, selEl, e.target.value), page.css)} />
                    <h4 style={{ marginTop: 10 }}>Style ({page.file.replace(/\.html$/, '.css')})</h4>
                    <select style={{ width: '100%' }} value={selCss} onChange={(e) => setSelCss(e.target.value)}>
                      {parseCss(page.css).map((r) => <option key={r.selector} value={r.selector}>{r.selector}</option>)}
                    </select>
                    {['color', 'background', 'font-size', 'padding', 'margin', 'display', 'border-radius'].map((k) => (
                      <div key={k} className="row" style={{ marginTop: 6 }}>
                        <span className="hint" style={{ width: 90 }}>{k}</span>
                        <input value={parseCss(page.css).find((r) => r.selector === selCss)?.props[k] || ''}
                          onChange={(e) => patchPage(page.html, setCssProp(page.css, selCss, k, e.target.value))} placeholder="—" />
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <h4>Live code</h4>
                    <pre className="code">{page.html}</pre>
                  </div>
                </div>
              </div>
            )}

            {mode === 'chtml' && <div className="card"><Editor height="420px" language="html" value={page.html} onChange={(v) => patchPage(v || '', page.css)} /></div>}
            {mode === 'ccss' && <div className="card"><Editor height="420px" language="css" value={page.css} onChange={(v) => patchPage(page.html, v || '')} /></div>}
            {mode === 'js' && <div className="card"><Editor height="420px" language="javascript" value={data.js} onChange={(v) => { const n = { ...data, js: v || '' }; setData(n); persist(n); }} /></div>}
            {mode === 'ts' && <div className="card"><Editor height="420px" language="typescript" value={data.ts} onChange={(v) => { const n = { ...data, ts: v || '' }; setData(n); persist(n); }} /></div>}
            {mode === 'flow' && (
              <div className="card">
                <WorkflowEditor nodes={data.workflow.nodes} edges={data.workflow.edges}
                  onChange={(n, e) => regenWorkflow({ ...data, workflow: { nodes: n, edges: e } })} />
                <pre className="code">{data.workflowGen}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
