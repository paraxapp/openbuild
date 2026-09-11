import JSZip from 'jszip';
import type { ProjectData, WFNode } from './api';
import { migrateProject, activePage } from './api';

// ---- HTML visual helpers (code is truth: DOM mutate -> serialize back to code string)
export function parseHtmlElements(html: string): { path: string; tag: string; text: string }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = Array.from(doc.body.querySelectorAll('*'));
  return els.slice(0, 300).map((el, i) => ({
    path: `${i}:${el.tagName.toLowerCase()}${el.getAttribute('data-ob') ? '#' + el.getAttribute('data-ob') : ''}`,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || '').trim().slice(0, 80),
  }));
}

export function patchHtmlText(html: string, index: number, newText: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = doc.body.querySelectorAll('*');
  const el = els[index];
  if (!el) return html;
  el.textContent = newText;
  return doc.body.innerHTML;
}

export function deleteHtmlElement(html: string, index: number): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = doc.body.querySelectorAll('*');
  const el = els[index];
  if (!el) return html;
  el.remove();
  return doc.body.innerHTML;
}

export function moveHtmlElement(html: string, from: number, to: number): string {
  if (from === to) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = Array.from(doc.body.querySelectorAll('*'));
  const el = els[from];
  const target = els[to];
  if (!el) return html;
  const clone = el.cloneNode(true);
  el.remove();
  if (!target) { doc.body.appendChild(clone); return doc.body.innerHTML; }
  if (from < to) target.after(clone); else target.before(clone);
  return doc.body.innerHTML;
}

export type PaletteKind = 'heading' | 'text' | 'button' | 'image' | 'input' | 'box';

export const PALETTE: { kind: PaletteKind; label: string }[] = [
  { kind: 'heading', label: 'Heading' },
  { kind: 'text', label: 'Text' },
  { kind: 'button', label: 'Button' },
  { kind: 'image', label: 'Image' },
  { kind: 'input', label: 'Input' },
  { kind: 'box', label: 'Container' },
];

export function paletteSnippet(kind: PaletteKind): string {
  const id = `n${Date.now() % 100000}`;
  switch (kind) {
    case 'heading': return `<h2 data-ob="${id}">New heading</h2>`;
    case 'text': return `<p data-ob="${id}">New text — drag to reorder.</p>`;
    case 'button': return `<button data-ob="${id}" onclick="onCta()">New button</button>`;
    case 'image': return `<img data-ob="${id}" src="https://picsum.photos/640/360" alt="image" style="max-width:100%;border-radius:8px" />`;
    case 'input': return `<input data-ob="${id}" placeholder="Type here" />`;
    default: return `<div data-ob="${id}" class="box" style="padding:16px;border:1px dashed #999;border-radius:8px">Container</div>`;
  }
}

export function addHtmlElement(html: string, tag: string): string {
  const map: Record<string, PaletteKind> = { h1: 'heading', h2: 'heading', p: 'text', button: 'button', img: 'image', input: 'input', div: 'box' };
  return `${html}\n${paletteSnippet(map[tag] || 'box')}`;
}

export function dropPalette(html: string, kind: PaletteKind, atIndex?: number): string {
  const snippet = paletteSnippet(kind);
  if (atIndex === undefined) return `${html}\n${snippet}`;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = doc.body.querySelectorAll('*');
  const target = els[atIndex];
  const tmp = new DOMParser().parseFromString(snippet, 'text/html');
  const node = tmp.body.firstChild;
  if (!node) return html;
  if (!target) doc.body.appendChild(node);
  else target.before(node);
  return doc.body.innerHTML;
}

export function buildSrcDoc(d: ProjectData, pageId?: string): string {
  const dd = migrateProject(d as any);
  const pg = pageId ? dd.pages.find((p) => p.id === pageId) || activePage(dd) : activePage(dd);
  const js = `${dd.js || ''}\n\n/* workflow.gen */\n${stripTypes(dd.workflowGen || '')}`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pg.css || ''}</style></head><body>${pg.html || ''}<script>${js}<\/script></body></html>`;
}

function stripTypes(ts: string): string {
  return ts.replace(/export\s+/g, '').replace(/:\s*(string|number|boolean|void|any)\b/g, '');
}

// ---- CSS visual helpers
export type CSSRule = { selector: string; props: Record<string, string> };

export function parseCss(css: string): CSSRule[] {
  const rules: CSSRule[] = [];
  for (const b of css.split('}')) {
    const parts = b.split('{');
    if (parts.length !== 2) continue;
    const selector = parts[0].trim();
    if (!selector) continue;
    const props: Record<string, string> = {};
    for (const decl of parts[1].split(';')) {
      const [k, ...rest] = decl.split(':');
      if (!k || rest.length === 0) continue;
      props[k.trim()] = rest.join(':').trim();
    }
    rules.push({ selector, props });
  }
  return rules;
}

export function serializeCss(rules: CSSRule[]): string {
  return rules.map((r) => `${r.selector} { ${Object.entries(r.props).map(([k, v]) => `${k}: ${v};`).join(' ')} }`).join('\n');
}

export function setCssProp(css: string, selector: string, key: string, value: string): string {
  const rules = parseCss(css);
  const r = rules.find((x) => x.selector === selector);
  if (r) {
    if (!value) delete r.props[key];
    else r.props[key] = value;
  } else if (value) {
    rules.push({ selector, props: { [key]: value } });
  }
  return serializeCss(rules);
}

// ---- Workflow (Unreal-style) -> TypeScript codegen
export function workflowToTS(nodes: WFNode[]): string {
  const lines = [
    '// AUTO-GENERATED from visual workflow. Edit visually; hand edits between markers are preserved on regenerate.',
    '// @visual-begin',
  ];
  const triggers = nodes.filter((n) => n.type === 'trigger');
  const actions = nodes.filter((n) => n.type !== 'trigger');
  if (triggers.length === 0) lines.push('export function onWorkflow(): void {');
  for (const t of triggers) {
    lines.push(`export function ${sanitizeFn(t.label || t.id)}(): void {`);
    lines.push(`  // @visual-node ${t.id}`);
    for (const a of actions) lines.push(`  ${actionToTS(a)}`);
    lines.push('}');
  }
  if (triggers.length === 0) {
    for (const a of actions) lines.push(`  ${actionToTS(a)}`);
    lines.push('}');
  }
  lines.push('// @visual-end');
  return lines.join('\n');
}

function actionToTS(a: WFNode): string {
  const d = (a.detail || '').replace(/'/g, "\\'");
  switch (a.type) {
    case 'log': return `console.log('${d || a.label}'); // @visual-node ${a.id}`;
    case 'setText': return `document.querySelector('[data-ob]')!.textContent = '${d || a.label}'; // @visual-node ${a.id}`;
    case 'fetch': return `fetch('${d || 'https://example.com/api'}').then(r => r.json()).then(console.log); // @visual-node ${a.id}`;
    default: return `// ${a.label} // @visual-node ${a.id}`;
  }
}

function sanitizeFn(s: string): string {
  const c = s.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c) ? c : 'onWorkflow';
}

export function mergeWorkflowGen(existingTs: string, freshGen: string): string {
  if (!existingTs.includes('// @visual-begin')) return `${existingTs}\n\n${freshGen}`;
  return existingTs.replace(/\/\/ @visual-begin[\s\S]*?\/\/ @visual-end/, () =>
    freshGen.slice(freshGen.indexOf('// @visual-begin'))
  );
}

export async function exportOpen(d: ProjectData): Promise<Blob> {
  const dd = migrateProject(d as any);
  const zip = new JSZip();
  for (const p of dd.pages) {
    zip.file(p.file, `<!doctype html>\n<html>\n<head>\n<link rel="stylesheet" href="${p.file.replace(/\.html$/, '.css')}">\n</head>\n<body>\n${p.html}\n<script src="app.js"><\/script>\n</body>\n</html>`);
    zip.file(p.file.replace(/\.html$/, '.css'), p.css || '');
  }
  zip.file('app.js', `${dd.js || ''}\n\n${stripTypes(dd.workflowGen || '')}`);
  zip.file('app.ts', dd.ts || '');
  zip.file('workflow.gen.ts', dd.workflowGen || '');
  zip.file('workflow.json', JSON.stringify(dd.workflow, null, 2));
  zip.file('project.json', JSON.stringify(dd, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

export async function importOpen(file: Blob): Promise<ProjectData> {
  const zip = await JSZip.loadAsync(file);
  const read = async (n: string) => {
    const f = zip.file(n);
    return f ? f.async('string') : '';
  };
  const pj = await read('project.json');
  if (pj) return migrateProject(JSON.parse(pj));
  const html = await read('index.html');
  const css = await read('index.css');
  const base = migrateProject({ name: 'Imported' } as any);
  if (html) base.pages[0].html = html;
  if (css) base.pages[0].css = css;
  base.js = await read('app.js');
  base.ts = await read('app.ts');
  const wj = await read('workflow.json');
  if (wj) base.workflow = JSON.parse(wj);
  base.workflowGen = await read('workflow.gen.ts');
  return base;
}
