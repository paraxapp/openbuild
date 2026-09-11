'use strict';
const express = require('express');
const { getPool, validProvider } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// Default starter files (code is truth).
function defaultData(name) {
  return {
    name,
    html: `<main class="page">\n  <h1 data-ob="title">Hello OpenBuild</h1>\n  <p data-ob="sub">Edit visually or in code — code is truth.</p>\n  <button data-ob="cta" onclick="onCta()">Click me</button>\n</main>`,
    css: `.page { font-family: system-ui; padding: 24px; }\n.page h1 { color: #111; }\n.page button { padding: 8px 14px; }`,
    js: `function onCta() {\n  // @visual-node cta-log\n  console.log('cta clicked');\n}`,
    ts: `export function onCta(): void {\n  // @visual-node cta-log\n  console.log('cta clicked');\n}`,
    workflow: {
      nodes: [
        { id: 'trigger-cta', type: 'trigger', label: 'onCta trigger' },
        { id: 'cta-log', type: 'log', label: 'console.log cta' }
      ],
      edges: [{ from: 'trigger-cta', to: 'cta-log' }]
    }
  };
}

// List from both DBs, merge.
router.get('/', async (req, res) => {
  try {
    const owner = req.user.sub;
    const out = [];
    for (const provider of ['neon', 'supabase']) {
      try {
        const pool = getPool(provider);
        const r = await pool.query(
          'select id, owner_id, name, storage_provider, updated_at from projects where owner_id = $1 order by updated_at desc limit 100',
          [owner]
        );
        // owner_id differs per DB (separate sequences) — filter by email join is v2.
        // For v1: auth DB is primary; projects in non-primary DB store owner email in data_jsonb.
        // To keep per-project choice simple, we also match owner_id here; cross-DB ownership
        // is enforced by owner_email check below in detail routes.
        for (const row of r.rows) out.push({ ...row, storage: row.storage_provider });
      } catch (e) {
        // DB not configured -> skip, don't fail whole list.
        if (!String(e.message).includes('not configured')) throw e;
      }
    }
    // v1 ownership note: ids are per-DB; client sends storage + id for detail/update/delete.
    res.json({ projects: out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'list failed' });
  }
});

// Create in chosen provider (per-project choice).
router.post('/', async (req, res) => {
  try {
    const { name, storage } = req.body || {};
    const provider = (storage || 'neon').toLowerCase();
    if (!validProvider(provider)) return res.status(400).json({ error: 'storage must be neon or supabase' });
    const pool = getPool(provider);
    const data = defaultData(name || 'Untitled');
    data.owner_email = req.user.email;
    const r = await pool.query(
      'insert into projects(owner_id, name, storage_provider, data_jsonb) values($1,$2,$3,$4) returning id, name, storage_provider, updated_at',
      [req.user.sub, data.name, provider, JSON.stringify(data)]
    );
    res.json({ project: { ...r.rows[0], storage: provider }, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create failed: ' + e.message });
  }
});

async function loadProject(provider, id) {
  const pool = getPool(provider);
  const r = await pool.query('select id, owner_id, name, storage_provider, data_jsonb, updated_at from projects where id = $1', [id]);
  return r.rows[0] || null;
}

function owns(row, req) {
  if (!row) return false;
  const d = row.data_jsonb || {};
  if (d.owner_email && d.owner_email.toLowerCase() === String(req.user.email).toLowerCase()) return true;
  return Number(row.owner_id) === Number(req.user.sub);
}

router.get('/:storage/:id', async (req, res) => {
  try {
    const provider = req.params.storage.toLowerCase();
    if (!validProvider(provider)) return res.status(400).json({ error: 'bad storage' });
    const row = await loadProject(provider, req.params.id);
    if (!row || !owns(row, req)) return res.status(404).json({ error: 'not found' });
    res.json({ project: { ...row, storage: provider }, data: row.data_jsonb });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'get failed' });
  }
});

router.put('/:storage/:id', async (req, res) => {
  try {
    const provider = req.params.storage.toLowerCase();
    if (!validProvider(provider)) return res.status(400).json({ error: 'bad storage' });
    const row = await loadProject(provider, req.params.id);
    if (!row || !owns(row, req)) return res.status(404).json({ error: 'not found' });
    const { name, data } = req.body || {};
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data object required' });
    data.owner_email = req.user.email;
    const pool = getPool(provider);
    const r = await pool.query(
      'update projects set name = coalesce($1, name), data_jsonb = $2, updated_at = now() where id = $3 returning id, name, storage_provider, updated_at',
      [name || row.name, JSON.stringify(data), req.params.id]
    );
    res.json({ project: { ...r.rows[0], storage: provider } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'save failed' });
  }
});

router.delete('/:storage/:id', async (req, res) => {
  try {
    const provider = req.params.storage.toLowerCase();
    if (!validProvider(provider)) return res.status(400).json({ error: 'bad storage' });
    const row = await loadProject(provider, req.params.id);
    if (!row || !owns(row, req)) return res.status(404).json({ error: 'not found' });
    await getPool(provider).query('delete from projects where id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete failed' });
  }
});

module.exports = { router };
