# Research Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual local astronomy dashboard that retrieves, deduplicates, caches, filters, and migrates keyword-matched arXiv and NASA ADS papers.

**Architecture:** A React/Vite client calls an Express local API. The server owns arXiv/ADS adapters, normalization, refresh orchestration, ZIP migration, and a SQLite repository; shared TypeScript contracts keep both sides aligned.

**Tech Stack:** Node.js 22+, TypeScript, React, Vite, Express, better-sqlite3, Zod, fast-xml-parser, fflate, Vitest, Testing Library, Supertest, Playwright.

## Global Constraints

- Project name and visible wordmark: `Research Update`.
- Work only inside `RFU/` except for the repository-level Git metadata created by commits.
- ADS is optional; missing `ADS_API_TOKEN` must leave arXiv fully usable.
- Interface labels are Chinese/English; source paper metadata is never translated.
- Initial and temporary searches retrieve at most 50 newest records per available source; incremental refresh uses a 24-hour overlap.
- The ADS token never enters client responses, SQLite, logs, or ZIP exports.
- Automated tests use fixtures, not live arXiv or ADS requests.
- Do not add accounts, cloud sync, notifications, AI summaries, PDF storage, or background daemons.

---

## File Map

- `package.json`, `tsconfig*.json`, `vite.config.ts`: project and build/test configuration.
- `src/shared/contracts.ts`: client/server request, response, and domain types.
- `src/server/db/{schema,repository}.ts`: SQLite lifecycle and persistence boundary.
- `src/server/sources/{types,arxiv,ads}.ts`: source adapter boundary and parsers.
- `src/server/papers/merge.ts`: deterministic normalization and deduplication.
- `src/server/services/{search,refresh,migration}.ts`: application workflows.
- `src/server/{app,index}.ts`: HTTP boundary and local production server.
- `src/client/{App,api,i18n}.tsx`: dashboard orchestration, API client, translations.
- `src/client/components/*.tsx`: header, saved-search navigation, feed, settings/migration.
- `src/client/styles.css`: approved dashboard/newspaper visual system and responsiveness.
- `tests/fixtures/*`: fixed arXiv Atom and ADS JSON responses.
- `tests/e2e/research-update.spec.ts`: browser-level acceptance path.
- `.env.example`, `.gitignore`, `README.md`: safe local operation.

### Task 1: Project Skeleton and Shared Contracts

**Files:**
- Create: `RFU/package.json`, `RFU/tsconfig.json`, `RFU/tsconfig.server.json`, `RFU/vite.config.ts`, `RFU/index.html`
- Create: `RFU/src/shared/contracts.test.ts`, `RFU/src/shared/contracts.ts`, `RFU/src/client/main.tsx`
- Create: `RFU/.gitignore`, `RFU/.env.example`

**Interfaces:**
- Produces: `SourceName`, `Paper`, `SavedSearch`, `SourceStatus`, `FeedQuery`, `ApiError` from `src/shared/contracts.ts`.

- [ ] **Step 1: Write the failing shared-contract test**

```ts
import { describe, expect, it } from "vitest";
import { feedQuerySchema } from "./contracts";

describe("feedQuerySchema", () => {
  it("rejects unsupported sort values so server and client stay aligned", () => {
    expect(feedQuerySchema.safeParse({ sort: "score" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Add test tooling and verify RED**

Run:

```bash
npm init -y
npm install react react-dom express better-sqlite3 zod fast-xml-parser fflate multer
npm install -D typescript vite @vitejs/plugin-react tsx concurrently vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event supertest @playwright/test @types/node @types/react @types/react-dom @types/express @types/better-sqlite3 @types/supertest @types/multer
```

Set `package.json` scripts exactly to `dev: concurrently "vite" "tsx watch src/server/index.ts"`, `build: vite build && tsc -p tsconfig.server.json --noEmit`, `start: tsx src/server/index.ts`, `test: vitest run`, `test:watch: vitest`, and `test:e2e: playwright test`. Configure Vite `build.outDir` as `dist/client`; the local production server serves that directory.

Run: `npm test -- src/shared/contracts.test.ts`

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Add minimal contracts and configuration**

```ts
import { z } from "zod";
export type SourceName = "arxiv" | "ads";
export type Paper = { id:string; title:string; abstract:string; authors:string[]; publishedAt:string; journal:string|null; doi:string|null; arxivId:string|null; bibcode:string|null; citationCount:number|null; sources:SourceName[]; sourceUrls:Partial<Record<SourceName,string>>; matchedSearchIds:string[]; favorite:boolean; read:boolean };
export type SavedSearch = { id:string; query:string; enabled:boolean; createdAt:string; updatedAt:string };
export type SourceStatus = { source:SourceName; available:boolean; state:"idle"|"refreshing"|"ok"|"error"; message:string|null };
export const feedQuerySchema = z.object({ sort:z.enum(["latest","oldest","citations"]).default("latest"), searchId:z.string().optional(), source:z.enum(["arxiv","ads"]).optional(), state:z.enum(["all","unread","favorites","read"]).default("all"), from:z.string().optional(), to:z.string().optional() });
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type ApiError = { error:{ code:string; message:string } };
```

Configure ESM, strict TypeScript, React JSX, Vitest `jsdom`, Vite `/api` proxy, `.env` ignore, database/build/log ignores, and `.env.example` containing only `ADS_API_TOKEN=` and `PORT=4173`.

- [ ] **Step 4: Verify GREEN and build**

Run: `npm test -- src/shared/contracts.test.ts` and `npm run build`

Expected: PASS; build exits 0.

- [ ] **Step 5: Commit**

```bash
git add RFU/package.json RFU/package-lock.json RFU/tsconfig*.json RFU/vite.config.ts RFU/index.html RFU/src RFU/.gitignore RFU/.env.example
git commit -m "chore: scaffold research update"
```

### Task 2: SQLite Repository

**Files:**
- Create: `RFU/src/server/db/schema.ts`, `RFU/src/server/db/repository.ts`, `RFU/src/server/db/repository.test.ts`

**Interfaces:**
- Consumes: `Paper`, `SavedSearch`, `FeedQuery`.
- Produces: `openDatabase(path)`, `Repository` with `list/create/update/deleteSearch`, `upsertPapers`, `listPapers`, `setPaperState`, `get/setRefreshMarker`, and `replaceAll`.

- [ ] **Step 1: Write failing repository tests**

```ts
it("keeps a paper unique across repeated refreshes", () => {
  const repo = makeTestRepository();
  repo.upsertPapers([paper({ id:"doi:10.1/a", favorite:false })], "s1");
  repo.upsertPapers([paper({ id:"doi:10.1/a", favorite:false })], "s1");
  expect(repo.listPapers({ sort:"latest", state:"all" })).toHaveLength(1);
});

it("does not overwrite user state during metadata refresh", () => {
  const repo = makeTestRepository();
  repo.upsertPapers([paper({ id:"p1", favorite:false })], "s1");
  repo.setPaperState("p1", { favorite:true });
  repo.upsertPapers([paper({ id:"p1", favorite:false })], "s1");
  expect(repo.listPapers({ sort:"latest", state:"favorites" })[0].favorite).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/db/repository.test.ts`

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement schema and repository**

Create the seven tables from the design with foreign keys enabled, uniqueness on DOI/arXiv ID/bibcode, prepared statements, JSON serialization only for author/source arrays, and explicit transactions for `upsertPapers` and `replaceAll`. Use dependency injection of an opened `better-sqlite3` database so tests use `:memory:`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/server/db/repository.test.ts`

Expected: both tests PASS with no warnings.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/server/db
git commit -m "feat: persist research data in sqlite"
```

### Task 3: arXiv and ADS Source Adapters

**Files:**
- Create: `RFU/src/server/sources/types.ts`, `RFU/src/server/sources/arxiv.ts`, `RFU/src/server/sources/ads.ts`
- Create: `RFU/src/server/sources/arxiv.test.ts`, `RFU/src/server/sources/ads.test.ts`
- Create: `RFU/tests/fixtures/arxiv-response.xml`, `RFU/tests/fixtures/ads-response.json`

**Interfaces:**
- Produces: `SourceSearchInput { query:string; limit:50; since?:string }`, `SourcePaper`, `SourceAdapter.search(input):Promise<SourcePaper[]>`.

```ts
export type SourceSearchInput = { query:string; limit:50; since?:string };
export type SourcePaper = { source:SourceName; title:string; abstract:string; authors:string[]; publishedAt:string; updatedAt:string|null; journal:string|null; doi:string|null; arxivId:string|null; bibcode:string|null; citationCount:number|null; url:string };
export interface SourceAdapter { readonly source:SourceName; search(input:SourceSearchInput):Promise<SourcePaper[]> }
```

- [ ] **Step 1: Write failing parser and authentication tests**

```ts
it("parses Atom entries into source papers", async () => {
  const adapter = createArxivAdapter(async () => new Response(arxivFixture));
  expect((await adapter.search({ query:'"fast radio burst"', limit:50 }))[0].arxivId).toBe("2607.00001");
});

it("sends the ADS token only in the authorization header", async () => {
  let request!: Request;
  const adapter = createAdsAdapter("secret", async r => (request=r, new Response(adsFixture)));
  await adapter.search({ query:"galaxy evolution", limit:50 });
  expect(request.headers.get("authorization")).toBe("Bearer secret");
  expect(request.url).not.toContain("secret");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/sources`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters**

Use `https://export.arxiv.org/api/query` with `max_results=50`, newest-first ordering, and `fast-xml-parser`. Use ADS `/v1/search/query`, `abs:` phrase-safe queries, a minimal `fl` list, and bearer authentication. Inject `fetch`; throw typed `SourceError` containing source, retryability, and safe message. Add a serialized arXiv queue enforcing at least three seconds between starts and finite timeout/retry wrappers shared by both adapters.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/server/sources`

Expected: parser, URL, field, auth, timeout, and missing-token tests PASS.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/server/sources RFU/tests/fixtures
git commit -m "feat: add arxiv and ads adapters"
```

### Task 4: Deterministic Paper Merge

**Files:**
- Create: `RFU/src/server/papers/merge.ts`, `RFU/src/server/papers/merge.test.ts`

**Interfaces:**
- Consumes: `SourcePaper[]`.
- Produces: `mergeSourcePapers(records): Paper[]` and `canonicalPaperId(record): string`.

- [ ] **Step 1: Write failing deduplication tests**

```ts
it.each(["doi","arxivId","bibcode"])("merges duplicate records by %s", key => {
  const records = duplicatePair(key);
  const merged = mergeSourcePapers(records);
  expect(merged).toHaveLength(1);
  expect(merged[0].sources.sort()).toEqual(["ads","arxiv"]);
});

it("falls back to normalized title and year", () => {
  expect(mergeSourcePapers(titleYearPair())).toHaveLength(1);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/papers/merge.test.ts`

Expected: FAIL because merge module does not exist.

- [ ] **Step 3: Implement minimal deterministic merge**

Normalize DOI case/prefix, strip arXiv version suffix, normalize Unicode/whitespace/punctuation in titles, and apply the exact identity priority DOI → arXiv ID → bibcode → title/year. Preserve every source URL and identifier; fill empty canonical fields from the newest non-empty source value; use maximum citation count.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/server/papers/merge.test.ts`

Expected: all identity and precedence tests PASS.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/server/papers
git commit -m "feat: deduplicate paper sources"
```

### Task 5: Search, Refresh, and HTTP API

**Files:**
- Create: `RFU/src/server/services/search.ts`, `RFU/src/server/services/refresh.ts`
- Create: `RFU/src/server/services/refresh.test.ts`, `RFU/src/server/app.ts`, `RFU/src/server/app.test.ts`, `RFU/src/server/index.ts`

**Interfaces:**
- Produces: `SearchService.temporarySearch(query)`, `RefreshService.refreshSaved(searchIds?)`, `createApp(deps)` and the API routes from the design.

- [ ] **Step 1: Write failing partial-success and marker tests**

```ts
it("commits arXiv results when ADS fails and advances only arXiv", async () => {
  const result = await harness({ ads:"fail", arxiv:"ok" }).refresh.refreshSaved();
  expect(result.sources).toMatchObject({ arxiv:{ state:"ok" }, ads:{ state:"error" } });
  expect(result.repo.getRefreshMarker("s1","arxiv")).not.toBeNull();
  expect(result.repo.getRefreshMarker("s1","ads")).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/services/refresh.test.ts src/server/app.test.ts`

Expected: FAIL because services and app do not exist.

- [ ] **Step 3: Implement services and routes**

Validate all bodies and queries with Zod. Render cached data independently of refresh. Apply 24-hour overlap to per-source markers. Return `{ data, meta }` on success and `{ error:{ code,message } }` on failure. Implement status, searches, papers, temporary search, refresh, settings, favorite/read mutations, and safe 404/error middleware. Build dependencies in `index.ts` from `DATABASE_PATH`, `ADS_API_TOKEN`, and `PORT`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/server/services src/server/app.test.ts`

Expected: CRUD, validation, missing-token, partial-success, overlap, and idempotence tests PASS.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/server/services RFU/src/server/app* RFU/src/server/index.ts
git commit -m "feat: expose local research api"
```

### Task 6: ZIP Export, Preview, and Transactional Restore

**Files:**
- Create: `RFU/src/server/services/migration.ts`, `RFU/src/server/services/migration.test.ts`
- Modify: `RFU/src/server/app.ts`

**Interfaces:**
- Produces: `exportArchive():Uint8Array`, `previewArchive(bytes):MigrationPreview`, `restoreArchive(bytes):MigrationPreview`.

```ts
export type MigrationPreview = { exportVersion:1; schemaVersion:1; createdAt:string; searches:number; papers:number; favorites:number };
```

- [ ] **Step 1: Write failing round-trip and rollback tests**

```ts
it("round-trips searches, papers, cache and user state", () => {
  seedFullDataset(sourceRepo);
  const zip = sourceMigration.exportArchive();
  targetMigration.restoreArchive(zip);
  expect(targetRepo.exportSnapshot()).toEqual(sourceRepo.exportSnapshot());
});

it("leaves current data unchanged when one reference is invalid", () => {
  const before = targetRepo.exportSnapshot();
  expect(() => targetMigration.restoreArchive(invalidReferenceZip())).toThrow();
  expect(targetRepo.exportSnapshot()).toEqual(before);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/server/services/migration.test.ts`

Expected: FAIL because migration service does not exist.

- [ ] **Step 3: Implement versioned safe migration**

Use `fflate` with only the predefined manifest/data JSON entries. Enforce 25 MB compressed, 200 MB expanded, 100,000 papers, and 1,000 searches. Validate all IDs and references before preview; never include the token. Restore through `Repository.replaceAll` in one transaction, verify counts afterward, then expose export/preview/restore routes with multipart upload limited to 25 MB.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/server/services/migration.test.ts src/server/app.test.ts`

Expected: round trip, preview, limits, version rejection, invalid reference, and rollback tests PASS.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/server/services/migration* RFU/src/server/app.ts RFU/src/server/app.test.ts
git commit -m "feat: migrate local research archive"
```

### Task 7: Bilingual Dashboard Behavior

**Files:**
- Create: `RFU/src/client/api.ts`, `RFU/src/client/i18n.ts`, `RFU/src/client/App.tsx`, `RFU/src/client/App.test.tsx`
- Create: `RFU/src/client/components/Header.tsx`, `SavedSearchNav.tsx`, `PaperFeed.tsx`, `MigrationPanel.tsx`

**Interfaces:**
- Consumes: shared contracts and local API routes.
- Produces: complete dashboard interactions with cached-first refresh state.

- [ ] **Step 1: Write failing dashboard test**

```tsx
it("shows cached papers, switches language, and saves a temporary query", async () => {
  render(<App api={fakeApi()} />);
  expect(await screen.findByText("JWST constraints")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name:"EN" }));
  expect(screen.getByText("Following")).toBeVisible();
  await userEvent.type(screen.getByRole("searchbox"), "cosmic dawn");
  await userEvent.click(screen.getByRole("button", { name:"Save search" }));
  expect(await screen.findByText("cosmic dawn")).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/client/App.test.tsx`

Expected: FAIL because client modules do not exist.

- [ ] **Step 3: Implement minimal behavior**

Add a typed `ResearchApi` interface and fetch implementation. Keep filters in component state, persist language through settings, render cached feed before calling refresh, and implement saved-search CRUD, temporary search/save, refresh status, source filters, date/state/sort controls, favorite/read mutations, migration preview/confirmation, and localized empty/error states. Use a complete `zh`/`en` key map checked with `satisfies Record<MessageKey,string>`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/client`

Expected: interaction, partial-source status, filtering, state mutation, language, and migration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/client
git commit -m "feat: build bilingual research dashboard"
```

### Task 8: Approved Visual System and Responsiveness

**Files:**
- Create: `RFU/src/client/styles.css`, `RFU/src/client/styles.test.ts`
- Modify: `RFU/src/client/main.tsx`, `RFU/src/client/components/*.tsx`

**Interfaces:**
- Produces: dashboard layout at ≥900 px and drawer/single-column layout below 900 px.

- [ ] **Step 1: Write failing style-contract test**

```ts
it("contains the approved responsive dashboard breakpoint", () => {
  const css = readFileSync("src/client/styles.css", "utf8");
  expect(css).toContain("@media (max-width: 899px)");
  expect(css).toContain("--paper:");
  expect(css).toContain("font-family: Georgia");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/client/styles.test.ts`

Expected: FAIL because stylesheet does not exist.

- [ ] **Step 3: Implement the confirmed visual direction**

Define warm paper/background tokens, ink text, muted red/blue accents, serif titles, compact sans-serif controls, double-rule masthead, 250 px saved-search sidebar, readable paper cards, visible focus states, reduced-motion handling, and the 899 px drawer breakpoint. Add semantic class names to existing components; do not change behavior.

- [ ] **Step 4: Verify GREEN and inspect**

Run: `npm test -- src/client && npm run build`

Expected: PASS and build exits 0. Inspect desktop 1440×900 and mobile 390×844 with Playwright screenshots; no horizontal overflow, clipped controls, or missing focus indication.

- [ ] **Step 5: Commit**

```bash
git add RFU/src/client
git commit -m "style: apply research daily dashboard design"
```

### Task 9: Production Start, End-to-End Acceptance, and Documentation

**Files:**
- Create: `RFU/playwright.config.ts`, `RFU/tests/e2e/research-update.spec.ts`, `RFU/README.md`
- Modify: `RFU/src/server/index.ts`, `RFU/package.json`

**Interfaces:**
- Produces: one-command production start serving `/api` and the built client.

- [ ] **Step 1: Write failing end-to-end acceptance test**

```ts
test("works without ADS and restores a full exported archive", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("arXiv")).toBeVisible();
  await expect(page.getByText("ADS not configured")).toBeVisible();
  await addSavedSearch(page, "fast radio burst");
  const archive = await exportArchive(page);
  await clearLocalData(page);
  await restoreArchive(page, archive);
  await expect(page.getByText("fast radio burst")).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:e2e`

Expected: FAIL because production serving, fixtures, and helpers are incomplete.

- [ ] **Step 3: Complete production wiring and README**

Serve `dist/client` with SPA fallback after API routes, use a temporary fixture-backed source mode only under `NODE_ENV=test`, and document Node 22+, `npm install`, `.env` setup, `npm run dev`, `npm run build && npm start`, ADS token acquisition, ZIP migration, cache cleanup, local-only limits, and data locations.

- [ ] **Step 4: Run full verification**

Run: `npm test`, `npm run build`, and `npm run test:e2e`

Expected: all unit/integration/component/E2E tests PASS; build exits 0; no skipped tests or console errors.

- [ ] **Step 5: Commit**

```bash
git add RFU
git commit -m "docs: finish research update setup"
```

## Final Verification

- [ ] Run `git status --short` and confirm only intended RFU changes exist; do not alter unrelated root deletions or `PA/`.
- [ ] Run `npm test`, `npm run build`, and `npm run test:e2e` from `RFU/` once more.
- [ ] Start with `ADS_API_TOKEN` unset and verify the UI reports ADS unavailable while arXiv fixture/live manual smoke testing remains usable.
- [ ] Start with a valid ADS token supplied by the user and manually smoke-test one temporary two-source search; do not record the token or response in Git.
- [ ] Export, clear, restore, and compare search/paper/favorite/read counts shown by the migration preview.
