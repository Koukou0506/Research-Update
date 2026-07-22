# Refresh-Triggered Radar Recomputation

## Goal

After the paper-source refresh that runs when the interface opens, regenerate the current day's daily selection and research radar from the refreshed paper cache. Manual refresh must perform the same regeneration.

## Current Failure

The interface loads the radar before its startup paper refresh. When that refresh finishes, it reloads only the paper feed. Manual refresh requests the radar again, but the server returns the existing same-day selection instead of recomputing it. Topics therefore continue to use the previous AI-analysis set.

## Design

The daily-radar API accepts an optional explicit refresh flag. A normal request preserves today's stable cached selection. A refresh request calls `RadarService.recomputeDaily()` before building the daily view.

The client continues to load the cached radar during startup for fast first paint. After either startup or manual source refresh completes, it reloads the paper feed, requests a forced daily-radar recomputation, and then rebuilds the topic radar. The refresh button remains disabled until the entire sequence completes.

Unchanged paper analyses continue to use the existing cache key. Only new or changed leading candidates are sent to the configured AI provider.

## Data Flow

1. Load cached settings, sources, papers, profile, daily selection, and topics.
2. Refresh enabled saved searches and persist returned papers.
3. Reload the paper feed.
4. Request `GET /api/radar/daily?refresh=true`.
5. Recompute scores and the daily selection, reusing valid AI analyses.
6. Request the topic list so topics are rebuilt from the updated analyses.
7. End the refreshing state.

Manual refresh begins at step 2 and follows the same remaining sequence.

## Failure Handling

- Source-level failures retain the existing partial-source status behavior.
- If radar regeneration fails, the client retains the previously rendered radar data and always clears the refreshing state.
- The existing server-side rule-only fallback remains unchanged when the AI provider is unavailable.
- Ordinary daily-radar reads without the refresh flag remain cache-stable.

## Testing

- Verify that a forced same-day daily-radar request recomputes after a newly added paper, while an ordinary request remains stable.
- Verify that startup source refresh is followed by a forced daily-radar request and topic reload.
- Verify that manual refresh uses the same forced radar path.
- Run focused tests, the full suite, and the production build.

## Out of Scope

- Background timers while the page remains open.
- Changes to saved-search refresh frequency or source adapters.
- Changes to ranking, topic generation, AI fallback, or cache-key semantics.
