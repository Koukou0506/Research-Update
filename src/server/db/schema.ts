import Database from "better-sqlite3";

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    abstract TEXT NOT NULL,
    authors_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    journal TEXT,
    doi TEXT,
    arxiv_id TEXT,
    bibcode TEXT,
    citation_count INTEGER
  );

  CREATE UNIQUE INDEX IF NOT EXISTS papers_doi_unique ON papers(doi) WHERE doi IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS papers_arxiv_unique ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS papers_bibcode_unique ON papers(bibcode) WHERE bibcode IS NOT NULL;

  CREATE TABLE IF NOT EXISTS paper_sources (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('arxiv', 'ads')),
    source_identifier TEXT NOT NULL,
    url TEXT NOT NULL,
    PRIMARY KEY (paper_id, source)
  );

  CREATE TABLE IF NOT EXISTS paper_search_matches (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, search_id)
  );

  CREATE TABLE IF NOT EXISTS paper_state (
    paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    read INTEGER NOT NULL DEFAULT 0 CHECK (read IN (0, 1)),
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS refresh_runs (
    search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('arxiv', 'ads')),
    last_success_at TEXT,
    attempted_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
    message TEXT,
    PRIMARY KEY (search_id, source)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO schema_metadata(key, value) VALUES ('schema_version', '1');
`;

export const openDatabase = (path: string): Database.Database => {
  const database = new Database(path);
  database.exec(schema);
  return database;
};
