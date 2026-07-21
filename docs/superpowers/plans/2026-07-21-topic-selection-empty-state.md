# Topic Selection Empty-State Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a selected topic's existing seven-day representative papers instead of filtering only the daily selection into an empty panel.

**Architecture:** Add a typed client method for the existing topic-detail API. `App` loads topic papers with stale-response protection and switches the radar's right panel between `DailySelection` and the existing `PaperFeed`; `DailySelection` no longer performs topic filtering.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- Do not change topic generation, counts, ranking, favorites navigation, or server behavior.
- Preserve the existing uncommitted AI compatibility changes.
- Reuse `GET /api/radar/topics/:id?windowDays=7` and `PaperFeed`.

---

### Task 1: Load and display selected topic papers

**Files:**
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/DailySelection.tsx`
- Modify: `src/client/components/DailySelection.test.tsx`

**Interfaces:**
- Consumes: `GET /api/radar/topics/:id?windowDays=7`, returning `{ topic: ResearchTopic; papers: Paper[] }`
- Produces: `ResearchApi.getTopicDetail(id: string, windowDays?: number): Promise<{ topic: ResearchTopic; papers: Paper[] }>`

- [ ] **Step 1: Write the failing application regression test**

Add a non-daily topic paper, provide a `getTopicDetail` spy on the test API, select that topic, and assert that its paper is visible and the spy received `(topic.id, 7)`:

```tsx
const topicPaper = { ...paper, id: "topic-paper", title: "A topic paper outside today's selection" };
const selectedTopic = { ...topic, label: "microlensing", representativePaperIds: [topicPaper.id] };
const api = fakeApi();
api.listTopics = vi.fn(async () => [selectedTopic]);
const getTopicDetail = vi.fn(async () => ({ topic: selectedTopic, papers: [topicPaper] }));
Object.assign(api, { getTopicDetail });
render(<App api={api} />);
await user.click(await screen.findByRole("button", { name: /microlensing/ }));
expect(await screen.findByText(topicPaper.title)).toBeVisible();
expect(getTopicDetail).toHaveBeenCalledWith(selectedTopic.id, 7);
```

- [ ] **Step 2: Run the regression test and verify RED**

Run `npm.cmd test -- src/client/App.test.tsx`.

Expected: FAIL because `App` never calls `getTopicDetail` and the paper is outside `dailyView.papers`.

- [ ] **Step 3: Add the typed topic-detail client method**

Add to `ResearchApi`:

```ts
getTopicDetail(id: string, windowDays?: number): Promise<{ topic: ResearchTopic; papers: Paper[] }>;
```

Add to the real API and existing test fixtures:

```ts
getTopicDetail(id, windowDays = 7) {
  const params = new URLSearchParams({ windowDays: String(windowDays) });
  return requestJson(`/api/radar/topics/${encodeURIComponent(id)}?${params}`);
},
```

- [ ] **Step 4: Switch the radar panel based on topic selection**

Add `topicPapers` and `topicLoading` state. Use an effect keyed by `selectedTopicId` that requests `api.getTopicDetail(selectedTopicId, 7)`, uses an `active` cleanup guard against stale responses, stores `[]` on failure, and clears state when selection is removed.

Update `updateState` to patch `topicPapers`. Render the existing loading label while loading, `PaperFeed` titled with the selected topic when selected, and `DailySelection` only when no topic is selected.

- [ ] **Step 5: Remove topic filtering from DailySelection**

Remove the `selectedTopic` prop and topic-filtering `useMemo` logic from `DailySelection`; render `view.papers` directly. Update its direct test call accordingly.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- src/client/App.test.tsx src/client/components/DailySelection.test.tsx src/client/components/TopicRadar.test.tsx
```

Expected: all focused tests pass, including the new out-of-daily topic regression.

- [ ] **Step 7: Run full verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

Expected: all tests pass, the build exits 0, and the diff check reports no whitespace errors.

- [ ] **Step 8: Commit the implementation**

Stage only the client files and this plan, preserving the unrelated AI compatibility changes:

```powershell
git add src/client/App.test.tsx src/client/api.ts src/client/App.tsx src/client/components/DailySelection.tsx src/client/components/DailySelection.test.tsx docs/superpowers/plans/2026-07-21-topic-selection-empty-state.md
git commit -m "fix: show papers for selected radar topics"
```
