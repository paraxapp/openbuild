import JSZip from 'jszip';
import type { ProjectData, WFNode } from './api';

// ---- HTML visual helpers (code is truth: DOM mutate -> serialize back to code string)
export function parseHtmlElements(html: string): { path: string; tag: string; text: string }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const els = Array.from(doc.body.querySelectorAll('*'));
  return els.slice(0, 200).map((el, i) => ({
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

export function addHtmlElement(html: string, tag: string): string {
  const safe = ['h1', 'p', 'button', 'div'].includes(tag) ? tag : 'div';
  return `${html}\n<${safe} data-ob="n${Date.now() % 10000}">New ${safe}</${safe}>`;
}

export function buildSrcDoc(d: ProjectData): string {
  const js = `${d.js || ''}\n\n/* workflow.gen */\n${stripTypes(d.workflowGen || '')}`;
  return `<!doctype html><html><head><style>${d.css || ''}</style></head><body>${d.html || ''}<script>${js}<\/script></body></html>`;
}

function stripTypes(ts: string): string {
  // minimal TS -> JS for preview (type annotations, export keyword)
  return ts
    .replace(/export\s+/g, '')
    .replace(/:\s*(string|number|boolean|void|any)\b/g, '');
}

// ---- CSS visual helpers
export type CSSRule = { selector: string; props: Record<string, string> };

export function parseCss(css: string): CSSRule[] {
  const rules: CSSRule[] = [];
  const blocks = css.split('}');
  for (const b of blocks) {
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
  const lines: string[] = [
    '// AUTO-GENERATED from visual workflow. Edit visually; hand edits between markers are preserved on regenerate.',
    '// @visual-begin',
  ];
  const triggers = nodes.filter((n) => n.type === 'trigger');
  const actions = nodes.filter((n) => n.type !== 'trigger');
  if (triggers.length === 0) lines.push('export function onWorkflow(): void {');
  for (const t of triggers) {
    const fn = sanitizeFn(t.label || t.id);
    lines.push(`export function ${fn}(): void {`);
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
    case 'log':
      return `console.log('${d || a.label}'); // @visual-node ${a.id}`;
    case 'setText':
      return `document.querySelector('[data-ob]')!.textContent = '${d || a.label}'; // @visual-node ${a.id}`;
    case 'fetch':
      return `fetch('${d || 'https://example.com/api'}').then(r => r.json()).then(console.log); // @visual-node ${a.id}`;
    default:
      return `// ${a.label} // @visual-node ${a.id}`;
  }
}

function sanitizeFn(s: string): string {
  const c = s.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c) ? c : 'onWorkflow';
}

// Merge regenerate: keep hand-written TS outside markers, replace inside.
export function mergeWorkflowGen(existingTs: string, freshGen: string): string {
  if (!existingTs.includes('// @visual-begin')) return `${existingTs}\n\n${freshGen}`;
  return existingTs.replace(/\/\/ @visual-begin[\s\S]*?\/\/ @visual-end/, () =>
    freshGen.slice(freshGen.indexOf('// @visual-begin'))
  );
}

export async function exportZip(d: ProjectData): Promise<Blob> {
  const zip = new JSZip();
  zip.file('index.html', `<!doctype html>\n<html>\n<head>\n<link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${d.html}\n<script src="app.js"><\/script>\n</body>\n</html>`);
  zip.file('styles.css', d.css || '');
  zip.file('app.js', `${d.js || ''}\n\n${stripTypes(d.workflowGen || '')}`);
  zip.file('app.ts', d.ts || '');
  zip.file('workflow.gen.ts', d.workflowGen || '');
  zip.file('workflow.json', JSON.stringify(d.workflow, null, 2));
  zip.file('project.json', JSON.stringify(d, null, 2));
  return zip.generateAsync({ type: 'blob' });
}
