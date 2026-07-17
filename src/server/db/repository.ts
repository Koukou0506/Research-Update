import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import type { FeedQuery, Paper, SavedSearch, SourceName } from "../../shared/contracts";

type PaperStatePatch = Partial<Pick<Paper, "favorite" | "read">>;

type PaperRow = {
  id: string;
  title: string;
  abstract: string;
  authors_json: string;
  published_at: string;
  journal: string | null;
  doi: string | null;
  arxiv_id: string | null;
  bibcode: string | null;
  citation_count: number | null;
  favorite: number;
  read: number;
};

const nowIso = (): string => new Date().toISOString();

export class Repository {
  constructor(private readonly database: Database.Database) {}

  createSearch(query: string): SavedSearch {
    const timestamp = nowIso();
    const search: SavedSearch = {
      id: randomUUID(),
      query: query.trim(),
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.database
      .prepare("INSERT INTO saved_searches(id, query, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(search.id, search.query, 1, search.createdAt, search.updatedAt);
    return search;
  }

  listSearches(): SavedSearch[] {
    const rows = this.database
      .prepare("SELECT id, query, enabled, created_at, updated_at FROM saved_searches ORDER BY created_at")
      .all() as Array<{ id: string; query: string; enabled: number; created_at: string; updated_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  updateSearch(id: string, patch: Partial<Pick<SavedSearch, "query" | "enabled">>): SavedSearch | null {
    const current = this.listSearches().find((search) => search.id === id);
    if (!current) return null;
    const next = { ...current, ...patch, query: patch.query?.trim() ?? current.query, updatedAt: nowIso() };
    this.database
      .prepare("UPDATE saved_searches SET query = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(next.query, next.enabled ? 1 : 0, next.updatedAt, id);
    return next;
  }

  deleteSearch(id: string): boolean {
    return this.database.prepare("DELETE FROM saved_searches WHERE id = ?").run(id).changes > 0;
  }

  upsertPapers(papers: Paper[], searchId?: string): void {
    const transaction = this.database.transaction((records: Paper[]) => {
      const upsertPaper = this.database.prepare(`
        INSERT INTO papers(id, title, abstract, authors_json, published_at, journal, doi, arxiv_id, bibcode, citation_count)
        VALUES (@id, @title, @abstract, @authors, @publishedAt, @journal, @doi, @arxivId, @bibcode, @citationCount)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          abstract = excluded.abstract,
          authors_json = excluded.authors_json,
          published_at = excluded.published_at,
          journal = excluded.journal,
          doi = excluded.doi,
          arxiv_id = excluded.arxiv_id,
          bibcode = excluded.bibcode,
          citation_count = excluded.citation_count
      `);
      const addState = this.database.prepare(
        "INSERT OR IGNORE INTO paper_state(paper_id, favorite, read, updated_at) VALUES (?, ?, ?, ?)",
      );
      const addSource = this.database.prepare(`
        INSERT INTO paper_sources(paper_id, source, source_identifier, url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(paper_id, source) DO UPDATE SET source_identifier = excluded.source_identifier, url = excluded.url
      `);
      const addMatch = this.database.prepare(
        "INSERT OR IGNORE INTO paper_search_matches(paper_id, search_id) VALUES (?, ?)",
      );

      for (const paper of records) {
        upsertPaper.run({ ...paper, authors: JSON.stringify(paper.authors) });
        addState.run(paper.id, paper.favorite ? 1 : 0, paper.read ? 1 : 0, nowIso());
        for (const source of paper.sources) {
          const identifier = source === "arxiv" ? paper.arxivId : paper.bibcode;
          const url = paper.sourceUrls[source];
          if (identifier && url) addSource.run(paper.id, source, identifier, url);
        }
        const matches = new Set([...paper.matchedSearchIds, ...(searchId ? [searchId] : [])]);
        for (const matchId of matches) addMatch.run(paper.id, matchId);
      }
    });

    transaction(papers);
  }

  listPapers(query: FeedQuery): Paper[] {
    const rows = this.database.prepare(`
      SELECT p.*, ps.favorite, ps.read
      FROM papers p JOIN paper_state ps ON ps.paper_id = p.id
    `).all() as PaperRow[];

    const papers = rows.map((row) => this.hydratePaper(row));
    const filtered = papers.filter((paper) => {
      if (query.searchId && !paper.matchedSearchIds.includes(query.searchId)) return false;
      if (query.source && !paper.sources.includes(query.source)) return false;
      if (query.state === "favorites" && !paper.favorite) return false;
      if (query.state === "unread" && paper.read) return false;
      if (query.state === "read" && !paper.read) return false;
      if (query.from && paper.publishedAt < query.from) return false;
      if (query.to && paper.publishedAt > query.to) return false;
      return true;
    });

    return filtered.sort((left, right) => {
      if (query.sort === "citations") return (right.citationCount ?? -1) - (left.citationCount ?? -1);
      const direction = query.sort === "oldest" ? 1 : -1;
      return left.publishedAt.localeCompare(right.publishedAt) * direction;
    });
  }

  setPaperState(id: string, patch: PaperStatePatch): boolean {
    const current = this.database
      .prepare("SELECT favorite, read FROM paper_state WHERE paper_id = ?")
      .get(id) as { favorite: number; read: number } | undefined;
    if (!current) return false;
    const favorite = patch.favorite ?? Boolean(current.favorite);
    const read = patch.read ?? Boolean(current.read);
    this.database
      .prepare("UPDATE paper_state SET favorite = ?, read = ?, updated_at = ? WHERE paper_id = ?")
      .run(favorite ? 1 : 0, read ? 1 : 0, nowIso(), id);
    return true;
  }

  getRefreshMarker(searchId: string, source: SourceName): string | null {
    const row = this.database
      .prepare("SELECT last_success_at FROM refresh_runs WHERE search_id = ? AND source = ?")
      .get(searchId, source) as { last_success_at: string | null } | undefined;
    return row?.last_success_at ?? null;
  }

  setRefreshResult(
    searchId: string,
    source: SourceName,
    result: { status: "ok" | "error"; attemptedAt: string; message?: string | null },
  ): void {
    const successAt = result.status === "ok" ? result.attemptedAt : this.getRefreshMarker(searchId, source);
    this.database.prepare(`
      INSERT INTO refresh_runs(search_id, source, last_success_at, attempted_at, status, message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(search_id, source) DO UPDATE SET
        last_success_at = excluded.last_success_at,
        attempted_at = excluded.attempted_at,
        status = excluded.status,
        message = excluded.message
    `).run(searchId, source, successAt, result.attemptedAt, result.status, result.message ?? null);
  }

  getSetting<T>(key: string, fallback: T): T {
    const row = this.database.prepare("SELECT value_json FROM settings WHERE key = ?").get(key) as
      | { value_json: string }
      | undefined;
    return row ? (JSON.parse(row.value_json) as T) : fallback;
  }

  setSetting<T>(key: string, value: T): void {
    this.database.prepare(`
      INSERT INTO settings(key, value_json) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run(key, JSON.stringify(value));
  }

  private hydratePaper(row: PaperRow): Paper {
    const sources = this.database
      .prepare("SELECT source, url FROM paper_sources WHERE paper_id = ? ORDER BY source")
      .all(row.id) as Array<{ source: SourceName; url: string }>;
    const matches = this.database
      .prepare("SELECT search_id FROM paper_search_matches WHERE paper_id = ? ORDER BY search_id")
      .all(row.id) as Array<{ search_id: string }>;
    return {
      id: row.id,
      title: row.title,
      abstract: row.abstract,
      authors: JSON.parse(row.authors_json) as string[],
      publishedAt: row.published_at,
      journal: row.journal,
      doi: row.doi,
      arxivId: row.arxiv_id,
      bibcode: row.bibcode,
      citationCount: row.citation_count,
      sources: sources.map((source) => source.source),
      sourceUrls: Object.fromEntries(sources.map((source) => [source.source, source.url])),
      matchedSearchIds: matches.map((match) => match.search_id),
      favorite: Boolean(row.favorite),
      read: Boolean(row.read),
    };
  }
}
