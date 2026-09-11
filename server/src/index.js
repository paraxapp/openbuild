'use strict';
// Render-only, ZERO DB. No Postgres, no auth backend.
// Serves built frontend. Projects live in browser localStorage + .open files.
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'none', store: 'local+.open', time: new Date().toISOString() }));

// Serve built frontend (Render Web Service monolith).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.json({ name: 'openbuild', client: 'not built yet — run npm run build' }));
}

app.listen(PORT, () => console.log(`OpenBuild (no-db) listening on ${PORT}`));
