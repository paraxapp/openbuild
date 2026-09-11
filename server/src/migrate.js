'use strict';

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);
-- NOTE: no projects table. Projects are local + .open files (Render-only, no DB projects).
`;

async function main() {
  require('dotenv').config();
  const { getPool } = require('./db');
  const pool = getPool();
  await pool.query(SCHEMA);
  console.log('migrated render users');
  await pool.end();
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { SCHEMA };
