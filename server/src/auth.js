'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: EXPIRES });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || String(password).length < 8) {
      return res.status(400).json({ error: 'email and password (min 8 chars) required' });
    }
    const pool = getPool();
    const hash = await bcrypt.hash(String(password), 10);
    let row;
    try {
      const r = await pool.query(
        'insert into users(email, password_hash) values(lower($1), $2) returning id, email',
        [String(email).trim(), hash]
      );
      row = r.rows[0];
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'email already registered' });
      throw e;
    }
    res.json({ token: sign(row), user: row, authDb: 'render' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'register failed: ' + e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const pool = getPool();
    const r = await pool.query('select id, email, password_hash from users where email = lower($1)', [String(email).trim()]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    res.json({ token: sign(user), user: { id: user.id, email: user.email }, authDb: 'render' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'login failed: ' + e.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.sub, email: req.user.email }, authDb: 'render' });
});

module.exports = { router, requireAuth };
