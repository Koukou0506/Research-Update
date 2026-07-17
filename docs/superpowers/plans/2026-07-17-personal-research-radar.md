# Personal Research Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explainable personal astronomy research radar with a confirmed research profile, rule-first ranking, optional OpenAI-compatible semantic analysis, daily selections, topic trends, and feedback learning.

**Architecture:** Keep arXiv/ADS retrieval unchanged. Add focused radar repositories and services behind shared contracts; deterministic rules remain the baseline, while a bounded AI adapter enriches selected candidates and degrades cleanly. The React client consumes stored daily and topic views through the local Express API.

**Tech Stack:** React 19, TypeScript 7, Express 5, SQLite via better-sqlite3, Zod 4, Vitest, Testing Library, Supertest, Playwright.

## Global Constraints

- AI credentials remain server-only and are never returned, logged, stored in SQLite, or exported.
- Automated tests use fixed source and AI fixtures; no test depends on live arXiv, ADS, or AI services.
- Existing search, refresh, feed, favorites, read state, and ZIP migration remain functional.
- AI failure falls back to normalized rule plus feedback scores; it never blocks source refresh.
- The first release excludes PDF analysis, citation graphs, notifications, multi-user support, cloud sync, silent profile mutation, and model training.

---

## File Structure

- `src/shared/radar.ts`: shared Zod schemas and radar API types.
- `src/server/db/radarRepository.ts`: persistence for profiles, facets, analyses, scores, topics, feedback, and daily selections.
- `src/server/radar/ruleScore.ts`: deterministic scoring and evidence.
- `src/server/radar/ai/types.ts`: AI provider boundary.
- `src/server/radar/ai/openaiCompatible.ts`: bounded OpenAI-compatible HTTP adapter.
- `src/server/radar/profileService.ts`: profile preview, confirmation, and versioning.
- `src/server/radar/radarService.ts`: candidate scoring, AI enrichment, daily-selection stability, and feedback.
- `src/server/radar/topicService.ts`: stable-topic aggregation and emerging-topic thresholds.
- `src/client/components/ProfileSetup.tsx`: profile description and facet confirmation.
- `src/client/components/TopicRadar.tsx`: stable/emerging topic column.
- `src/client/components/DailySelection.tsx`: explainable ranked paper list and feedback controls.
- Existing `schema.ts`, `app.ts`, `index.ts`, `api.ts`, `App.tsx`, `i18n.ts`, `styles.css`, and migration files are modified only to wire these units together.

### Task 1: Shared contracts and schema-v2 persistence

**Files:**
- Create: `src/shared/radar.ts`
- Create: `src/server/db/radarRepository.ts`
- Create: `src/server/db/radarRepository.test.ts`
- Modify: `src/server/db/schema.ts`

**Interfaces:**
- Produces: `ResearchProfile`, `ProfileFacet`, `PaperScore`, `PaperAnalysis`, `ResearchTopic`, `PaperFeedback`, `DailySelection`, and `RadarRepository` CRUD methods used by all later tasks.

- [ ] **Step 1: Write failing repository tests**

```ts
it("versions confirmed profiles without overwriting history", () => {
  const first = radar.confirmProfile("spectroscopy", [{ kind: "method", value: "spectroscopy", weight: 1 }]);
  const second = radar.confirmProfile("retrieval", [{ kind: "method", value: "retrieval", weight: 1 }]);
  expect(second.version).toBe(first.version + 1);
  expect(radar.getActiveProfile()?.text).toBe("retrieval");
});

it("round-trips feedback, cached analysis, topics, scores, and a stable daily selection", () => {
  radar.saveFeedback({ paperId: "p1", relevance: "relevant", reason: null, undone: false });
  radar.saveDailySelection({ date: "2026-07-17", profileVersion: 1, paperIds: ["p1"] });
  expect(radar.getDailySelection("2026-07-17", 1)?.paperIds).toEqual(["p1"]);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/db/radarRepository.test.ts`

Expected: FAIL because `RadarRepository` and radar tables do not exist.

- [ ] **Step 3: Add the v2 schema and repository**

Add idempotent tables named `research_profiles`, `profile_facets`, `paper_scores`, `paper_ai_analyses`, `research_topics`, `paper_topic_matches`, `paper_feedback`, and `daily_selections`. Store multi-value evidence as validated JSON, use foreign keys to `papers`, and update `schema_metadata.schema_version` to `2` only after the migration transaction succeeds.

```ts
export class RadarRepository {
  constructor(private readonly database: Database.Database) {}
  getActiveProfile(): ResearchProfile | null;
  confirmProfile(text: string, facets: ProfileFacetInput[]): ResearchProfile;
  saveAnalysis(analysis: PaperAnalysis): void;
  findAnalysis(cacheKey: string): PaperAnalysis | null;
  saveScore(score: PaperScore): void;
  saveFeedback(input: PaperFeedbackInput): PaperFeedback;
  undoFeedback(paperId: string): PaperFeedback | null;
  saveTopics(topics: ResearchTopic[]): void;
  listTopics(profileVersion: number): ResearchTopic[];
  saveDailySelection(selection: DailySelection): void;
  getDailySelection(date: string, profileVersion: number): DailySelection | null;
}
```

- [ ] **Step 4: Run repository and existing database tests**

Run: `npm test -- src/server/db/radarRepository.test.ts src/server/db/repository.test.ts`

Expected: PASS with schema version `2`, profile history retained, and radar rows round-tripped.

- [ ] **Step 5: Commit**

```bash
git add src/shared/radar.ts src/server/db/schema.ts src/server/db/radarRepository.ts src/server/db/radarRepository.test.ts
git commit -m "feat: add research radar persistence"
```

### Task 2: Deterministic rule and feedback scoring

**Files:**
- Create: `src/server/radar/ruleScore.ts`
- Create: `src/server/radar/ruleScore.test.ts`

**Interfaces:**
- Consumes: `Paper`, confirmed `ProfileFacet[]`, and non-undone `PaperFeedback[]`.
- Produces: `scorePaper(paper, facets, feedback): RuleScoreResult` and `combineScores(input): PaperScore`.

- [ ] **Step 1: Write failing scoring tests**

```ts
it("rewards confirmed method/object matches and applies explicit exclusions", () => {
  expect(scorePaper(paper, facets, []).evidence).toContainEqual(expect.objectContaining({ facet: "spectroscopy" }));
  expect(scorePaper(excludedPaper, facets, []).excluded).toBe(true);
});

it("renormalizes rule and feedback weights when AI is unavailable", () => {
  expect(combineScores({ rule: 80, semantic: null, feedback: 20 }).final).toBeCloseTo(66.15, 1);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/radar/ruleScore.test.ts`

Expected: FAIL because scoring functions are missing.

- [ ] **Step 3: Implement pure scoring functions**

Tokenize normalized title, abstract, journal, and authors; score positive facets by kind and weight; short-circuit confirmed exclusions; decay weak behavior signals; and combine `0.50 / 0.35 / 0.15` components. If semantic is null, divide the weighted rule-plus-feedback total by `0.65`.

```ts
export type RuleScoreResult = { score: number; excluded: boolean; evidence: ScoreEvidence[] };
export const combineScores = (input: { rule: number; semantic: number | null; feedback: number }): PaperScoreComponents => {
  const presentWeight = input.semantic === null ? 0.65 : 1;
  const weighted = input.rule * 0.5 + (input.semantic ?? 0) * 0.35 + input.feedback * 0.15;
  return {
    rule: input.rule,
    semantic: input.semantic,
    feedback: input.feedback,
    final: Math.max(0, Math.min(100, weighted / presentWeight)),
  };
};
```

- [ ] **Step 4: Run scoring tests**

Run: `npm test -- src/server/radar/ruleScore.test.ts`

Expected: PASS for matches, exclusions, feedback reasons, bounds, and fallback normalization.

- [ ] **Step 5: Commit**

```bash
git add src/server/radar/ruleScore.ts src/server/radar/ruleScore.test.ts
git commit -m "feat: add explainable radar scoring"
```

### Task 3: OpenAI-compatible analysis adapter

**Files:**
- Create: `src/server/radar/ai/types.ts`
- Create: `src/server/radar/ai/openaiCompatible.ts`
- Create: `src/server/radar/ai/openaiCompatible.test.ts`

**Interfaces:**
- Produces: `AiProvider.analyze(request): Promise<PaperAnalysisInput[]>`, `createOpenAiCompatibleProvider(config, fetcher?)`, and `buildAnalysisCacheKey(input: { paperId: string; contentHash: string; profileVersion: number; schemaVersion: number; baseUrl: string; model: string }): string`.

- [ ] **Step 1: Write failing adapter tests**

```ts
it("batches papers, validates JSON, and never exposes the API key", async () => {
  const provider = createOpenAiCompatibleProvider(config, fakeFetch(validResponse));
  await expect(provider.analyze(request)).resolves.toEqual([expect.objectContaining({ paperId: "p1", semanticScore: 91 })]);
  expect(JSON.stringify(await provider.status())).not.toContain(config.apiKey);
});

it.each([429, 500])("uses finite retry for transient status %s", async (status) => {
  const fetcher = sequenceFetch(status, status, 200);
  await createOpenAiCompatibleProvider(config, fetcher).analyze(request);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/radar/ai/openaiCompatible.test.ts`

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the provider boundary**

Use global `fetch`, `AbortSignal.timeout`, a maximum of three attempts, and Zod validation of the versioned response. Send paper ID/title/abstract plus confirmed profile facets in bounded batches. Treat 429/5xx as transient and other 4xx or invalid JSON as terminal. Never include credentials in errors or status.

```ts
export interface AiProvider {
  status(): Promise<{ available: boolean; baseUrl: string; model: string; message: string | null }>;
  analyze(request: AnalysisRequest): Promise<PaperAnalysisInput[]>;
}
```

- [ ] **Step 4: Run adapter tests**

Run: `npm test -- src/server/radar/ai/openaiCompatible.test.ts`

Expected: PASS for valid output, timeout, malformed JSON, finite retries, batching, and secret redaction.

- [ ] **Step 5: Commit**

```bash
git add src/server/radar/ai
git commit -m "feat: add configurable AI analysis adapter"
```

### Task 4: Profile preview and confirmation service

**Files:**
- Create: `src/server/radar/profileService.ts`
- Create: `src/server/radar/profileService.test.ts`

**Interfaces:**
- Consumes: `RadarRepository` and optional `AiProvider`.
- Produces: `preview(text): Promise<ProfileFacetInput[]>`, `confirm(text, facets): ResearchProfile`, `getActive()`.

- [ ] **Step 1: Write failing service tests**

```ts
it("returns AI-proposed facets without activating them", async () => {
  const preview = await service.preview("I study warm Neptune atmospheres with spectroscopy");
  expect(preview).toContainEqual({ kind: "method", value: "spectroscopy", weight: 1 });
  expect(radar.getActiveProfile()).toBeNull();
});

it("falls back to editable literal facets when AI is unavailable", async () => {
  await expect(serviceWithoutAi.preview("warm Neptune spectroscopy")).resolves.toEqual(expect.arrayContaining([
    expect.objectContaining({ value: "warm Neptune spectroscopy" }),
  ]));
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/radar/profileService.test.ts`

Expected: FAIL because `ProfileService` is missing.

- [ ] **Step 3: Implement preview, validation, confirmation, and versioning**

Require trimmed text of 10–5,000 characters, deduplicate normalized facets, bound weights to `0..1`, and persist only through `confirm`. AI preview failure returns one editable `topic` facet based on the original description.

- [ ] **Step 4: Run profile tests**

Run: `npm test -- src/server/radar/profileService.test.ts`

Expected: PASS for preview-only behavior, confirmation, version increments, validation, and fallback.

- [ ] **Step 5: Commit**

```bash
git add src/server/radar/profileService.ts src/server/radar/profileService.test.ts
git commit -m "feat: add confirmed research profiles"
```

### Task 5: Daily selection and feedback orchestration

**Files:**
- Create: `src/server/radar/radarService.ts`
- Create: `src/server/radar/radarService.test.ts`

**Interfaces:**
- Consumes: `Repository`, `RadarRepository`, optional `AiProvider`, `scorePaper`, and an injected clock.
- Produces: `getDailySelection()`, `recomputeDaily()`, `recordFeedback()`, and `undoFeedback()`.

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("stores a 5-10 item daily order and reuses it on the same profile day", async () => {
  const first = await service.getDailySelection();
  const second = await service.getDailySelection();
  expect(second.paperIds).toEqual(first.paperIds);
  expect(ai.analyze).toHaveBeenCalledTimes(1);
});

it("returns rule-ranked papers when an AI batch fails", async () => {
  ai.analyze.mockRejectedValue(new Error("rate limited"));
  expect((await service.recomputeDaily()).mode).toBe("rule-only");
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/radar/radarService.test.ts`

Expected: FAIL because orchestration is missing.

- [ ] **Step 3: Implement bounded candidate selection and feedback**

Load the active profile and papers, remove exclusions, sort by rule score, analyze at most 30 leading/ambiguous candidates in batches of 10, reuse cache keys, combine scores, store 5–10 papers, and preserve the same-day order. Recompute only for a new date, profile version, or explicit refresh reason. Relevant/irrelevant feedback is persisted; undo marks the active record undone.

- [ ] **Step 4: Run radar tests**

Run: `npm test -- src/server/radar/radarService.test.ts`

Expected: PASS for stable ordering, cache reuse, bounded calls, fallback, feedback, undo, and profile-version invalidation.

- [ ] **Step 5: Commit**

```bash
git add src/server/radar/radarService.ts src/server/radar/radarService.test.ts
git commit -m "feat: build daily research selections"
```

### Task 6: Stable and emerging topic radar

**Files:**
- Create: `src/server/radar/topicService.ts`
- Create: `src/server/radar/topicService.test.ts`

**Interfaces:**
- Produces: `buildTopics(profileVersion, now): ResearchTopic[]` and `getTopicDetail(topicId, windowDays)`.

- [ ] **Step 1: Write failing topic tests**

```ts
it("labels profile facets as stable topics", () => {
  expect(service.buildTopics(1, now)).toContainEqual(expect.objectContaining({ kind: "stable", label: "spectroscopy" }));
});

it("requires 7-day volume, baseline growth, two teams, and confidence for emerging status", () => {
  expect(service.buildTopics(1, now).find((topic) => topic.label === "3D retrieval")?.status).toBe("emerging");
  expect(lowDiversityService.buildTopics(1, now).some((topic) => topic.status === "emerging")).toBe(false);
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/radar/topicService.test.ts`

Expected: FAIL because topic aggregation is missing.

- [ ] **Step 3: Implement quantitative topic states**

Use a default emerging threshold of 3 relevant papers in 7 days, at least two distinct normalized author teams, mean confidence at least `0.70`, and either 50% growth over the preceding 30-day daily baseline or two papers scoring at least 85. Label insufficient evidence `signal`; AI supplies names/summaries only from stored paper analyses and paper IDs.

- [ ] **Step 4: Run topic tests**

Run: `npm test -- src/server/radar/topicService.test.ts`

Expected: PASS for stable, rising, emerging, cooling, signal, evidence links, and low-sample suppression.

- [ ] **Step 5: Commit**

```bash
git add src/server/radar/topicService.ts src/server/radar/topicService.test.ts
git commit -m "feat: add evidence-backed topic radar"
```

### Task 7: Local radar API and dependency wiring

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`
- Modify: `src/server/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `ProfileService`, `RadarService`, `TopicService`, and optional `AiProvider`.
- Produces: `/api/profile`, `/api/profile/preview`, `/api/radar/daily`, `/api/radar/topics`, `/api/papers/:id/feedback`, and `/api/ai/status`.

- [ ] **Step 1: Write failing API tests**

```ts
await request(app).post("/api/profile/preview").send({ text: profileText }).expect(200);
await request(app).put("/api/profile").send({ text: profileText, facets }).expect(200);
await request(app).get("/api/radar/daily").expect(200);
await request(app).post("/api/papers/p1/feedback").send({ relevance: "irrelevant", reason: "wrong-method" }).expect(200);
expect(JSON.stringify((await request(app).get("/api/ai/status")).body)).not.toContain("secret-key");
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/app.test.ts`

Expected: FAIL with 404 responses for radar routes.

- [ ] **Step 3: Add Zod-validated routes and startup wiring**

Extend `AppDependencies` with optional radar services. Construct `RadarRepository`, the provider only when `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` are present, then construct profile/radar/topic services. Return `503 AI_UNAVAILABLE` only for explicit AI operations; radar reads still use rule-only mode.

- [ ] **Step 4: Run server tests**

Run: `npm test -- src/server/app.test.ts src/server/radar`

Expected: PASS with validated bodies, 404 handling, fallback responses, and no secret exposure.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/app.test.ts src/server/index.ts .env.example
git commit -m "feat: expose local research radar API"
```

### Task 8: Two-column radar client

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/i18n.ts`
- Modify: `src/client/styles.css`
- Create: `src/client/components/ProfileSetup.tsx`
- Create: `src/client/components/ProfileSetup.test.tsx`
- Create: `src/client/components/TopicRadar.tsx`
- Create: `src/client/components/TopicRadar.test.tsx`
- Create: `src/client/components/DailySelection.tsx`
- Create: `src/client/components/DailySelection.test.tsx`

**Interfaces:**
- Consumes: shared radar contracts and new local API methods.
- Produces: profile setup flow and responsive `32% / 68%` radar workspace.

- [ ] **Step 1: Write failing component tests**

```tsx
it("previews facets and requires confirmation before showing the radar", async () => {
  render(<ProfileSetup api={api} onConfirmed={onConfirmed} />);
  await user.type(screen.getByRole("textbox"), profileText);
  await user.click(screen.getByRole("button", { name: "解析画像" }));
  expect(await screen.findByText("spectroscopy")).toBeVisible();
  expect(onConfirmed).not.toHaveBeenCalled();
});

it("filters the daily list when a topic is selected and records feedback", async () => {
  render(<App api={radarApi} />);
  await user.click(await screen.findByRole("button", { name: /光谱反演/ }));
  await user.click(screen.getByRole("button", { name: "不相关" }));
  expect(radarApi.recordFeedback).toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/client/components src/client/App.test.tsx`

Expected: FAIL because radar components and API methods are missing.

- [ ] **Step 3: Implement the profile gate and B-layout**

Add API methods for profile preview/confirmation, daily selection, topics, feedback, undo, and AI status. Render `ProfileSetup` when no active profile exists. Otherwise render `TopicRadar` left and `DailySelection` right; show rule/semantic/feedback evidence, cross-topic labels, AI-unavailable state, and structured irrelevant reasons. Below 760px, stack topic overview above papers.

- [ ] **Step 4: Run client tests and build**

Run: `npm test -- src/client`

Expected: PASS for setup, filtering, explanations, feedback, undo, bilingual copy, AI fallback, and mobile DOM order.

Run: `npm run build`

Expected: exit 0 with client and server TypeScript checks passing.

- [ ] **Step 5: Commit**

```bash
git add src/client src/shared/radar.ts
git commit -m "feat: add personal research radar interface"
```

### Task 9: Migration v2, end-to-end flow, and documentation

**Files:**
- Modify: `src/server/db/repository.ts`
- Modify: `src/server/services/migration.ts`
- Modify: `src/server/services/migration.test.ts`
- Modify: `tests/e2e/research-update.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: export format `2` / schema version `2` archives with radar data and no credentials.

- [ ] **Step 1: Write failing migration and E2E tests**

```ts
it("round-trips radar data in v2 without provider credentials", () => {
  const archive = migration.exportArchive();
  expect(strFromU8(unzipSync(archive)["data.json"])).toContain("researchProfiles");
  expect(strFromU8(unzipSync(archive)["data.json"])).not.toContain("AI_API_KEY");
});
```

```ts
test("creates a profile and persists radar feedback", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "研究方向" }).fill("warm Neptune atmosphere spectroscopy");
  await page.getByRole("button", { name: "解析画像" }).click();
  await page.getByRole("button", { name: "确认画像" }).click();
  await page.getByRole("button", { name: /光谱/ }).click();
  await page.getByRole("article").first().getByRole("button", { name: "不相关" }).click();
  await page.getByRole("option", { name: "研究方法不符" }).click();
  await page.reload();
  await expect(page.getByRole("article").first().getByText("研究方法不符")).toBeVisible();
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/server/services/migration.test.ts`

Expected: FAIL because export v1 omits radar tables.

Run: `npm run test:e2e -- tests/e2e/research-update.spec.ts`

Expected: FAIL because the profile/radar flow is not yet represented in the E2E fixture.

- [ ] **Step 3: Implement export-v2 validation and update documentation**

Extend `DatabaseSnapshot`, deletion/insertion order, reference validation, record limits, manifest counts, and restore verification for all radar tables. Export version `2` with schema `2`; accept both v2 archives and existing v1 archives, upgrading v1 by supplying empty radar collections before transactional restore. Document `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, daily analysis behavior, rule-only fallback, and credential exclusions in README without overwriting unrelated user edits.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: all Vitest suites pass with zero skipped relevant suites.

Run: `npm run build`

Expected: exit 0.

Run: `npm run test:e2e`

Expected: all Playwright tests pass against fixed fixtures.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/repository.ts src/server/services/migration.ts src/server/services/migration.test.ts tests/e2e/research-update.spec.ts README.md
git commit -m "feat: complete research radar migration and flow"
```

## Final Review Gate

- [ ] Confirm every approved specification section maps to Tasks 1–9.
- [ ] Run `git diff --check` and verify no accidental mojibake or unrelated formatting changes were introduced.
- [ ] Run `npm test`, `npm run build`, and `npm run test:e2e` from a clean dependency state.
- [ ] Inspect `git status --short`; only intentional files may remain modified.
