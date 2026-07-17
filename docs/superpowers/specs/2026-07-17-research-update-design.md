# Research Update Design

**Date:** 2026-07-17

**Status:** Approved for implementation planning

**Project directory:** `RFU/`

## Purpose

Research Update is a personal, locally hosted astronomy paper dashboard. It retrieves papers matching saved or temporary searches from arXiv and NASA ADS, merges duplicates, and keeps a durable local reading history. The interface supports Chinese and English, while paper metadata remains in the source language.

## Success Criteria

- A user can add, edit, pause, resume, and delete saved keyword searches.
- Opening the site automatically performs an incremental refresh for enabled saved searches; the user can also refresh manually.
- A user can run a temporary search without adding it to the saved list, then save that query with one action if desired.
- Without an ADS token, arXiv search and refresh remain fully usable.
- With an ADS token, arXiv and ADS results appear in one deduplicated feed.
- Refreshing repeatedly does not create duplicate papers or lose papers after a transient source failure.
- Favorites, read state, settings, saved searches, and all cached paper metadata survive restarts.
- Exporting and importing a ZIP package preserves all local data except the ADS token.
- All application interface text is available in Chinese and English; source titles, abstracts, authors, and journal names are not translated.

## Scope

### Included

- Saved keyword searches and temporary searches.
- Automatic refresh on site open and manual refresh.
- arXiv and NASA ADS metadata retrieval.
- Unified, deduplicated paper feed.
- Keyword, source, state, and date filtering.
- Latest, oldest, and ADS citation-count sorting.
- Favorite and read/unread state.
- Local SQLite persistence and full paper metadata cache.
- Versioned ZIP export, import preview, validated restore, and rollback on failure.
- Responsive desktop and narrow-screen layouts.
- Chinese/English interface toggle.

### Excluded

- Accounts, multiple users, cloud synchronization, public hosting, or remote access.
- Email, push, or scheduled background notifications while the application is closed.
- Machine translation or AI-generated summaries.
- Full-text PDF storage or indexing.
- Editing ADS libraries or arXiv records.

## Architecture

The application is a local full-stack web project:

- A React and TypeScript client renders the dashboard and sends requests only to the local server.
- A Node.js and Express server owns source integrations, protects the ADS token, applies request limits, normalizes metadata, deduplicates records, and exposes a stable local JSON API.
- SQLite stores saved searches, paper metadata, source identifiers, keyword matches, user state, settings, and refresh history.

The application starts as one local process that serves the API and the built client. Development may run the client and server separately, but production behavior must not require two manual start commands.

## Components and Responsibilities

### Client

The client owns:

- dashboard layout and responsive navigation;
- bilingual interface text;
- saved-search editing and temporary-search interactions;
- filter and sort controls;
- paper detail expansion, source links, favorite state, and read state;
- refresh and source-status feedback;
- import preview and explicit restore confirmation.

The client does not contact arXiv or ADS directly and never receives the ADS token.

### Local API Server

The server owns:

- saved-search, settings, paper, and user-state CRUD endpoints;
- arXiv query construction and Atom XML parsing;
- ADS query construction, authentication, and JSON parsing;
- per-source request queues, finite retries, and timeout handling;
- metadata normalization and cross-source deduplication;
- incremental refresh orchestration;
- ZIP creation, validation, preview, and transactional restore;
- serving the production client bundle.

### Database

SQLite is the canonical local store. Logical records are:

- `saved_searches`: query text, enabled state, creation time, and update time;
- `papers`: canonical paper identity and normalized metadata;
- `paper_sources`: source-specific arXiv IDs, ADS bibcodes, DOI values, URLs, and source timestamps;
- `paper_search_matches`: many-to-many links between papers and saved searches;
- `paper_state`: favorite, read state, and state timestamps;
- `refresh_runs`: per-source and per-search status, attempt time, success time, and diagnostic message;
- `settings`: interface language and local display preferences;
- `schema_metadata`: database and export format versions.

Exact SQL definitions belong in the implementation plan, but foreign keys and uniqueness constraints must enforce identity and relationship integrity.

## Search and Refresh Flow

### Saved Searches

On site open, the client requests a refresh of enabled saved searches after rendering cached data. The server fetches each source through its request queue, normalizes results, deduplicates them, upserts papers and matches, then returns a per-source summary. Manual refresh follows the same path.

Each saved search records the last successful refresh independently for arXiv and ADS. A failed source does not advance that source's successful-refresh marker. The next refresh therefore retries the missing interval instead of silently skipping it.

The first refresh retrieves up to the 50 newest records from each available source for each saved search. Later refreshes use the last successful source timestamp with a 24-hour overlap to tolerate delayed indexing; deduplication absorbs the overlap. The initial release does not provide deep pagination beyond these locally accumulated results.

### Temporary Search

A temporary search queries up to the 50 newest records from each available source and returns normalized, deduplicated results. Results are cached as papers but do not create `paper_search_matches` rows unless the query is saved. The user may convert the query into a saved search with one action.

### Query Semantics

Plain keyword input searches title, abstract, and keyword metadata where supported. Quoted phrases remain phrases. The local API validates length and rejects empty or structurally invalid queries before contacting either source. Source-specific syntax stays behind adapter boundaries so the client uses one query model.

arXiv uses its official query API and Atom response format. ADS uses its authenticated search endpoint, requesting only fields needed by the dashboard. References:

- [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html)
- [NASA ADS Developer API](https://ui.adsabs.harvard.edu/help/api/)
- [NASA ADS Search Syntax](https://ui.adsabs.harvard.edu/help/search/search-syntax)

## Normalization and Deduplication

Both adapters produce one normalized paper shape containing title, abstract, authors, publication/submission dates, journal or category, DOI, arXiv ID, ADS bibcode, citation count when available, source URLs, and matched search IDs.

The server resolves duplicates in this order:

1. matching normalized DOI;
2. matching arXiv ID;
3. matching ADS bibcode;
4. matching normalized title plus publication year.

Source-specific identifiers and URLs remain attached to the canonical paper. Non-empty, more recent source metadata may fill missing canonical fields, but user state is never overwritten by a refresh. The implementation must make merge precedence deterministic and test it with fixed fixtures.

## Interface Design

### Visual Direction

The layout combines a research dashboard with an academic daily-paper aesthetic:

- permanent saved-search navigation on the left at desktop widths;
- unified paper feed on the right;
- warm paper-colored surfaces, restrained rules and borders, serif paper titles, and compact sans-serif controls;
- muted red and blue accents for source and search context;
- high information density without dark-mode control-console styling.

At narrow widths, the left navigation becomes a drawer and the paper feed remains a single column.

### Header

The header contains the Research Update wordmark, date, Chinese/English toggle, settings entry, unified temporary-search field, search action, and refresh action.

### Saved-Search Navigation

The left navigation shows saved searches and unread counts. It provides add, edit, delete, pause, and resume controls, plus entries for all papers, favorites, read papers, and data import/export.

### Paper Feed

Each card shows title, authors, date, journal or arXiv category, matched saved searches, sources, abstract preview, citation count when ADS supplies it, favorite/read state, and external source links. Filters cover saved search, source, unread/favorite state, and date range. Sort options are latest, oldest, and ADS citation count.

The feed shows cached data immediately. Refresh progress and source status appear without blocking reading or local state changes.

### Language Behavior

Interface labels, validation messages, empty states, and error messages use a complete Chinese/English message catalog. Switching language takes effect immediately and is saved locally. Paper metadata stays exactly as supplied after whitespace normalization.

## Source Availability and Error Handling

- Missing `ADS_API_TOKEN` disables ADS requests and shows a configuration status; it does not generate repeated errors.
- arXiv and ADS requests run independently. Partial success is committed and displayed.
- Source calls have explicit timeouts and a small finite retry policy with backoff for transient failures.
- arXiv requests pass through a polite rate-limited queue; ADS requests respect reported quota information and do not retry quota exhaustion immediately.
- The UI distinguishes complete success, partial success, and cached/offline display.
- Each failure provides a retry action and a concise localized message without exposing tokens or raw internal errors.
- Database writes for one refresh are transactional. A storage failure rolls back that refresh write set.

## Local Data and Cache Policy

All fetched paper metadata is retained by default. The settings view provides an explicit cache-cleaning action. Cleaning may remove unreferenced, non-favorite cached papers, but must preserve favorites, their source identifiers, and their read state. No automatic age-based deletion occurs in the initial release.

The ADS token is read only from `.env`, never returned by the API, never logged, never persisted to SQLite, and never exported.

## ZIP Migration

### Export

The server creates a ZIP containing JSON data rather than a raw SQLite file. The package includes:

- `manifest.json` with application export version, schema version, creation time, and record counts;
- saved searches;
- settings;
- normalized papers and source records;
- paper/search matches;
- favorite and read state;
- refresh history needed for incremental updates.

The package excludes the ADS token, logs, runtime files, dependencies, and downloaded PDFs.

### Import

Import has two explicit phases:

1. Preview validates archive structure, supported versions, data types, IDs, references, maximum compressed and expanded sizes, and maximum record counts. It reports export time and counts for searches, papers, and favorites without modifying the database.
2. Restore requires confirmation, writes into a transaction, verifies final counts and references, and commits only if every step succeeds. Any error rolls back fully, leaving current data unchanged.

Only predefined JSON entries are accepted. The importer ignores no invalid records silently: validation failure rejects the entire package with a localized explanation.

## API Shape

The local JSON API is grouped by responsibility:

- `/api/status` for source availability and configuration state;
- `/api/searches` for saved-search CRUD and enable state;
- `/api/papers` for feed queries, filters, sorting, and paper state;
- `/api/search` for temporary searches;
- `/api/refresh` for saved-search refresh and progress summaries;
- `/api/settings` for language and preferences;
- `/api/migration/export`, `/api/migration/preview`, and `/api/migration/restore` for ZIP migration.

Mutation requests validate bodies at the server boundary and return a consistent error envelope. Concrete request and response types belong in the implementation plan and must be shared with the client rather than duplicated.

## Testing Strategy

### Unit Tests

- arXiv and ADS query construction;
- Atom XML and ADS JSON parsing;
- field normalization and deterministic merge precedence;
- DOI, arXiv ID, bibcode, and title/year deduplication;
- filter and sort behavior;
- bilingual catalog completeness;
- export serialization and import validation.

### Server Integration Tests

Integration tests use fixed source response fixtures and a temporary SQLite database. They cover missing ADS configuration, independent source failure, partial commit, finite retry behavior, refresh-marker advancement, repeated-refresh idempotence, ZIP round trip, invalid package rejection, and restore rollback. Routine tests do not depend on live arXiv or ADS availability.

### Client Tests

Component tests cover saved-search management, temporary search, filtering, source status, favorite/read mutations, language switching, import preview, and restore confirmation.

### End-to-End Tests

End-to-end tests cover first launch without an ADS token, automatic refresh from cached fixtures, temporary search converted to a saved search, repeated refresh without duplicates, and export followed by full restore into an empty database.

## Operational Files

- `.env.example` documents `ADS_API_TOKEN` without containing a real token.
- `.env`, SQLite database files, logs, build output, dependencies, and `.superpowers/` brainstorming artifacts are ignored by Git.
- A README explains installation, local startup, obtaining/configuring an ADS token, migration, and the limitations of local-only operation.

## Implementation Constraints

- Keep source adapters isolated behind one normalized interface.
- Keep client/server shared contracts in one TypeScript module.
- Do not add accounts, cloud services, background daemons, translation, recommendation scoring, or PDF storage.
- Write behavioral tests before production code for each feature.
- Do not use live third-party services as the default automated test dependency.
