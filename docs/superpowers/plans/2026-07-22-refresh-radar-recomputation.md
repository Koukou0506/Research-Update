# Refresh-Triggered Radar Recomputation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompute the current daily selection and topics after startup and manual paper refreshes.

**Architecture:** Add an explicit force flag from the client API through the daily-radar route into `RadarService.getDailyView`. Sequence client refreshes so papers persist first, the daily radar recomputes second, and topics rebuild last.

**Tech Stack:** TypeScript, Express, React 19, Vitest, Testing Library

## Global Constraints

- Ordinary daily-radar reads remain same-day cache-stable.
- No background timer, ranking, source-adapter, AI fallback, or cache-key changes.
- Preserve the existing uncommitted AI compatibility changes.

---

### Task 1: Force same-day server recomputation

**Files:**
- Modify: `src/server/radar/radarService.test.ts`
- Modify: `src/server/radar/radarService.ts`
- Modify: `src/server/app.ts`

**Interfaces:**
- Produces: `RadarService.getDailyView(forceRefresh?: boolean): Promise<DailyRadarView>`
- Consumes: `GET /api/radar/daily?refresh=true`

- [ ] Add a failing service test that creates one paper and caches a daily view, adds another paper, verifies an ordinary view remains at one paper, then verifies `getDailyView(true)` contains both papers.
- [ ] Run `npm.cmd test -- src/server/radar/radarService.test.ts`; expect the new assertion to fail because the boolean argument is ignored.
- [ ] Change `getDailyView(forceRefresh = false)` to obtain its selection with `forceRefresh ? await this.recomputeDaily() : await this.getDailySelection()`.
- [ ] In `/api/radar/daily`, validate `refresh` as optional literal `"true"` and pass `request.query.refresh === "true"` to `getDailyView`.
- [ ] Run `npm.cmd test -- src/server/radar/radarService.test.ts src/server/app.test.ts`; expect all tests to pass.

### Task 2: Recompute after startup and manual refresh

**Files:**
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`

**Interfaces:**
- Produces: `ResearchApi.getDailyRadar(forceRefresh?: boolean): Promise<DailyRadarView>`
- Consumes: `/api/radar/daily` normally and `/api/radar/daily?refresh=true` when forced

- [ ] Add failing App tests that wait for startup refresh and assert `getDailyRadar(true)` occurs after `refresh`, then click the manual refresh button and assert another forced call.
- [ ] Run `npm.cmd test -- src/client/App.test.tsx`; expect failures because every radar request currently has no argument.
- [ ] Update the client method:

```ts
getDailyRadar(forceRefresh = false) {
  return requestJson(forceRefresh ? "/api/radar/daily?refresh=true" : "/api/radar/daily");
}
```

- [ ] Change `loadRadar(forceRefresh = false)` to await `api.getDailyRadar(forceRefresh)` before `api.listTopics()`, then set both states together.
- [ ] After startup `api.refresh()` resolves, reload papers and call `loadRadar(true)` before clearing `refreshing`. Change manual refresh to call `loadRadar(true)` after reloading papers.
- [ ] Run `npm.cmd test -- src/client/App.test.tsx`; expect all App tests to pass.
- [ ] Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`; expect zero failures, build exit 0, and no whitespace errors.
- [ ] Commit only the server/client refresh files and this plan with message `fix: recompute radar after paper refresh`, leaving AI compatibility files unstaged.
