-- Preserve existing object paths and document bodies during the first migration.
-- Row versions retain the existing compare-and-swap conflict protection.
CREATE TABLE IF NOT EXISTS objects (
  path TEXT PRIMARY KEY NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  updated_at TEXT NOT NULL
);
