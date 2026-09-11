'use strict';
require('dotenv').config();
const { Pool } = require('pg');

// Render-only: single Postgres for users (auth). Projects are NOT in DB.
// Projects live in browser localStorage + .open files (download/upload free).
let pool = null;
function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured. Set Render Postgres connection string.');
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000
  });
  return pool;
}

module.exports = { getPool };
