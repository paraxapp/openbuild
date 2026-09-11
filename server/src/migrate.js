'use strict';

const SCHEMA = `
create table if not exists users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table if not exists projects (
  id serial primary key,
  owner_id integer not null,
  name text not null default 'Untitled',
  storage_provider text not null default 'neon',
  data_jsonb jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists idx_projects_owner on projects(owner_id);
`;

async function migratePool(pool, label) {
  await pool.query(SCHEMA);
  console.log(`migrated ${label}`);
}

async function main() {
  require('dotenv').config();
  const { pools } = require('./db');
  const targets = Object.entries(pools).filter(([, p]) => p);
  if (targets.length === 0) {
    console.error('No DATABASE_URL configured. Set NEON_DATABASE_URL and/or SUPABASE_DATABASE_URL.');
    process.exit(1);
  }
  for (const [name, pool] of targets) {
    await migratePool(pool, name);
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { SCHEMA };
