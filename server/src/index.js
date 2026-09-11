'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

const { router: authRouter } = require('./auth');
const { router: projectsRouter } = require('./projects');
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);

// Serve built frontend (Render Web Service monolith).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.json({ name: 'openbuild-private', client: 'not built yet — run npm run build' }));
}

app.listen(PORT, () => console.log(`OpenBuild listening on ${PORT}`));
