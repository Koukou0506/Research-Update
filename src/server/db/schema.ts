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

  CREATE TABLE IF NOT EXISTS research_profiles (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    version INTEGER NOT NULL UNIQUE,
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_facets (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES research_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('topic', 'object', 'method', 'data-type', 'author', 'exclude')),
    value TEXT NOT NULL,
    weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1)
  );

  CREATE TABLE IF NOT EXISTS paper_ai_analyses (
    cache_key TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    profile_version INTEGER NOT NULL,
    semantic_score REAL NOT NULL,
    topics_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    emerging_topics_json TEXT NOT NULL,
    confidence REAL NOT NULL,
    recommend INTEGER NOT NULL CHECK (recommend IN (0, 1)),
    provider_base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_scores (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    profile_version INTEGER NOT NULL,
    rule_score REAL NOT NULL,
    semantic_score REAL,
    feedback_score REAL NOT NULL,
    final_score REAL NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('hybrid', 'rule-only')),
    evidence_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (paper_id, profile_version)
  );

  CREATE TABLE IF NOT EXISTS research_topics (
    id TEXT PRIMARY KEY,
    profile_version INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('stable', 'emerging')),
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('stable', 'rising', 'emerging', 'cooling', 'signal')),
    confidence REAL NOT NULL,
    paper_count_7d INTEGER NOT NULL,
    high_relevance_count INTEGER NOT NULL,
    baseline_change REAL NOT NULL,
    representative_paper_ids_json TEXT NOT NULL,
    active_teams_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_topic_matches (
    topic_id TEXT NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
    confidence REAL NOT NULL,
    evidence_json TEXT NOT NULL,
    PRIMARY KEY (topic_id, paper_id)
  );

  CREATE TABLE IF NOT EXISTS paper_feedback (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    relevance TEXT NOT NULL CHECK (relevance IN ('relevant', 'irrelevant')),
    reason TEXT,
    undone INTEGER NOT NULL CHECK (undone IN (0, 1)),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_selections (
    date TEXT NOT NULL,
    profile_version INTEGER NOT NULL,
    paper_ids_json TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('hybrid', 'rule-only')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (date, profile_version)
  );

  UPDATE schema_metadata SET value = '2' WHERE key = 'schema_version';
`;

export const openDatabase = (path: string): Database.Database => {
  const database = new Database(path);
  database.exec(schema);
  return database;
};
