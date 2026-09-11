import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { listLocal, saveLocal, createLocal, deleteLocal, type ProjectData, type LocalProject } from './api';
import {
  parseHtmlElements, patchHtmlText, addHtmlElement, buildSrcDoc,
  parseCss, setCssProp, workflowToTS, mergeWorkflowGen, exportOpen, importOpen
} from './builder';
import WorkflowEditor from './components/WorkflowEditor';

type Tab = 'vhtml' | 'chtml' | 'vcss' | 'ccss' | 'js' | 'ts' | 'flow' | 'preview';

export default function App() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [name, setName] = useState('My site');
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<ProjectData | null>(null);
  const [tab, setTab] = useState<Tab>('vhtml');
  const [selEl, setSelEl] = useState(0);
  const [selCss, setSelCss] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProjects(listLocal()); }, []);

  function create() {
    const rec = createLocal(name || 'Untitled');
    setProjects(listLocal());
    setOpenId(rec.id);
    setData(rec.data);
    setTab('vhtml');
  }

  function openProject(p: LocalProject) {
    setOpenId(p.id);
    setData(p.data);
    setTab('vhtml');
  }

  function save() {
    if (!openId || !data) return;
    setProjects(saveLocal(openId, data));
    setMsg('saved locally ✓ (+ Download .open for backup)');
  }

  useEffect(() => {
    if (!openId || !data) return;
    const t = setTimeout(() => saveLocal(openId, data), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const els = useMemo(() => (data ? parseHtmlElements(data.html) : []), [data?.html]);
  const rules = useMemo(() => parseCss(data?.css || ''), [data?.css]);
  useEffect(() => { if (!selCss && rules[0]) setSelCss(rules[0].selector); }, [rules, selCss]);

  function regenWorkflow(next: ProjectData) {
    const fresh = workflowToTS(next.workflow.nodes);
    setData({ ...next, ts: mergeWorkflowGen(next.ts, fresh), workflowGen: fresh });
  }

  async function download() {
    if (!data) return;
    const blob = await exportOpen(data);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.name || 'openbuild').replace(/[^\w\-]+/g, '_')}.open`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImportFile(f: File) {
    try {
      const d = await importOpen(f);
      const rec = createLocal(d.name || f.name.replace(/\.open$/i, ''));
      const all = saveLocal(rec.id, d);
      setProjects(all);
      setOpenId(rec.id);
      setData(d);
      setMsg(`imported ${f.name} ✓`);
    } catch (e: any) { setMsg('import failed: ' + e.message); }
  }

  return (
    <div className="wrap">
      <div className="row">
        <h2 style={{ margin: 0 }}>OpenBuild</h2>
        <span className="badge">no DB · local + .open · render-only</span>
        <span style={{ flex: 1 }} />
        {openId && data && (<><button onClick={save}>Save local</button><button className="ghost" onClick={download}>Download .open (free)</button></>)}
      </div>
      {msg && <p>{msg}</p>}

      {!openId || !data ? (
        <div className="card">
          <h3>Projects (local, no DB, no login)</h3>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="project name" />
            <button onClick={create}>New project</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>Open .open…</button>
            <input ref={fileRef} type="file" accept=".open,.zip" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ''; }} />
          </div>
          <div style={{ marginTop: 12 }}>
            {projects.map((p) => (
              <div key={p.id} className="row" style={{ marginBottom: 6 }}>
                <b>{p.data.name}</b><span>{p.id}</span>
                <button className="ghost" onClick={() => openProject(p)}>Open</button>
                <button className="ghost" onClick={() => setProjects(deleteLocal(p.id))}>Delete</button>
              </div>
            ))}
            {projects.length === 0 && <p>No local projects yet — create one or open a .open file.</p>}
          </div>
        </div>
      ) : (
        <div>
          <div className="row">
            <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
            <span className="badge">local: {openId}</span>
            <button className="ghost" onClick={() => { setOpenId(null); setData(null); setProjects(listLocal()); }}>← back</button>
          </div>
          <div className="tabs">
            {([['vhtml', 'Visual HTML'], ['chtml', 'Code HTML'], ['vcss', 'Visual CSS'], ['ccss', 'Code CSS'], ['js', 'JS'], ['ts', 'TS'], ['flow', 'Workflow'], ['preview', 'Preview']] as [Tab, string][]).map(([t, l]) => (
              <button key={t} className={tab === t ? '' : 'ghost'} onClick={() => setTab(t)}>{l}</button>
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
                <h4>{selCss || 'pick selector'} (→ patch CSS)</h4>
                {['color', 'background', 'font-size', 'padding', 'margin', 'display'].map((k) => (
                  <div key={k} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ width: 100 }}>{k}</span>
                    <input value={rules.find((r) => r.selector === selCss)?.props[k] || ''} onChange={(e) => data && selCss && setData({ ...data, css: setCssProp(data.css, selCss, k, e.target.value) })} placeholder={k} />
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
                onChange={(n, e) => regenWorkflow({ ...data, workflow: { nodes: n, edges: e } })}
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
