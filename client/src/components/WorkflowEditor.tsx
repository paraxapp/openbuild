import { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import type { WFNode, WFEdge } from '../api';

export default function WorkflowEditor({
  nodes, edges, onChange
}: {
  nodes: WFNode[]; edges: WFEdge[]; onChange: (n: WFNode[], e: WFEdge[]) => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const rfNodes: Node[] = useMemo(() => nodes.map((n, i) => ({
    id: n.id, position: { x: 40 + (i % 3) * 220, y: 40 + Math.floor(i / 3) * 140 },
    data: { label: `${n.type}: ${n.label}` }, selected: sel === n.id
  })), [nodes, sel]);
  const rfEdges: Edge[] = useMemo(() => edges.map((e, i) => ({
    id: `e${i}`, source: e.from, target: e.to
  })), [edges]);

  const selected = nodes.find((n) => n.id === sel) || null;

  function add(type: WFNode['type']) {
    const id = `${type}-${Date.now() % 100000}`;
    onChange([...nodes, { id, type, label: type === 'trigger' ? 'onCta' : `new ${type}`, detail: '' }], edges);
  }
  function updatePatch(patch: Partial<WFNode>) {
    if (!selected) return;
    onChange(nodes.map((n) => (n.id === selected.id ? { ...n, ...patch } : n)), edges);
  }
  function remove() {
    if (!selected) return;
    onChange(nodes.filter((n) => n.id !== selected.id), edges.filter((e) => e.from !== selected.id && e.to !== selected.id));
    setSel(null);
  }
  function connect(a: string, b: string) {
    if (!a || !b || a === b) return;
    onChange(nodes, [...edges, { from: a, to: b }]);
  }

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <div>
      <div className="row">
        <button className="ghost" onClick={() => add('trigger')}>+ trigger</button>
        <button className="ghost" onClick={() => add('log')}>+ log</button>
        <button className="ghost" onClick={() => add('setText')}>+ setText</button>
        <button className="ghost" onClick={() => add('fetch')}>+ fetch</button>
        <span className="badge">visual edit regenerates workflow.gen.ts</span>
      </div>
      <div style={{ height: 320, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, marginTop: 8 }}>
        <ReactFlow nodes={rfNodes} edges={rfEdges} onNodeClick={(_, n) => setSel(n.id)} fitView>
          <Background /><Controls />
        </ReactFlow>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">from…</option>{nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">to…</option>{nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
        </select>
        <button className="ghost" onClick={() => { connect(from, to); setFrom(''); setTo(''); }}>connect</button>
      </div>
      {selected && (
        <div className="card" style={{ marginTop: 8 }}>
          <h4>{selected.id} ({selected.type})</h4>
          <div className="row">
            <input value={selected.label} onChange={(e) => updatePatch({ label: e.target.value })} placeholder="label / fn name" />
            <input value={selected.detail || ''} onChange={(e) => updatePatch({ detail: e.target.value })} placeholder="detail (text, url, msg)" style={{ minWidth: 260 }} />
            <button className="ghost" onClick={remove}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
