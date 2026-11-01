-- Apply with: npx wrangler d1 execute citer --remote --file schema.sql (use --local for wrangler dev)
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  created INTEGER NOT NULL,
  style TEXT NOT NULL DEFAULT 'ieee' -- an id from styles.js
);

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  data TEXT NOT NULL, -- the citation's fields as JSON
  position REAL NOT NULL,
  added_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS citations_by_project ON citations (project, position);
