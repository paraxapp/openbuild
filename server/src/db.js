'use strict';
require('dotenv').config();
const { Pool } = require('pg');

function makePool(url) {
  if (!url) return null;
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000
  });
}

const pools = {
  neon: makePool(process.env.NEON_DATABASE_URL),
  supabase: makePool(process.env.SUPABASE_DATABASE_URL)
};

const PRIMARY = (process.env.PRIMARY_AUTH_DB || 'neon').toLowerCase() === 'supabase' ? 'supabase' : 'neon';

function getPool(name) {
  const p = pools[name];
  if (!p) throw new Error(`Database "${name}" is not configured. Set ${name === 'neon' ? 'NEON_DATABASE_URL' : 'SUPABASE_DATABASE_URL'}.`);
  return p;
}

function authPool() {
  // Users always live in primary DB (email+password v1).
  return getPool(PRIMARY);
}

function validProvider(name) {
  return name === 'neon' || name === 'supabase';
}

module.exports = { pools, getPool, authPool, validProvider, PRIMARY };
