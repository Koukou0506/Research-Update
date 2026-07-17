# Personal Research Radar Design

**Date:** 2026-07-17

**Status:** Approved for implementation planning

**Project:** Research Update

## Purpose

Research Update will evolve from a saved-search paper feed into a personal research radar. The radar reduces the time required to screen new astronomy papers and surfaces relevant work that does not share the user's exact keywords.

The existing arXiv and NASA ADS integrations remain the retrieval and persistence foundation. A transparent rule-based ranking layer provides reliable baseline relevance, while an optional OpenAI-compatible API adds semantic reranking, recommendation explanations, topic assignment, and grounded trend summaries.

## Success Criteria

- A user can describe their research interests in natural language, review the parsed structure, and edit it before activation.
- Opening the application shows a daily selection of approximately 5–10 papers ranked for the active research profile.
- Each selected paper explains why it is relevant and exposes the main rule, semantic, and feedback factors behind its rank.
- The topic radar displays stable profile topics and evidence-backed emerging topics.
- A user can mark a paper relevant or irrelevant, optionally provide a reason, undo the feedback, and observe the feedback affect later rankings.
- A missing, disabled, or failing AI API never prevents source refresh, rule ranking, or access to cached papers.
- AI calls are bounded, cached, schema-validated, and visible through non-secret status and usage information.
- AI credentials never reach the browser, logs, SQLite database, or migration archives.

## Product Structure

The primary desktop view uses a two-column research-radar layout:

- The left column occupies approximately 32% of the workspace and shows stable and emerging research topics.
- The right column occupies approximately 68% and shows the daily selection.
- Selecting a topic filters the paper list. A separate detail action opens its 7-day and 30-day history, representative papers, and active authors or teams.
- On narrow screens, topic overview precedes the daily selection. Selecting a topic opens its filtered paper list.

The existing full feed, saved searches, temporary search, favorites, read state, source filters, and migration tools remain available as secondary workflows.

## Research Profile

The research profile has two representations:

1. The user-authored natural-language description states research directions, objects, methods, current questions, preferred authors, and explicit exclusions.
2. A structured representation contains confirmed topics, objects, methods, data types, authors, and exclusion rules used by deterministic scoring.

An AI service may parse the natural-language description into proposed structured facets. The user must review and confirm those facets before they affect ranking. The AI may later propose profile changes based on repeated feedback, but it cannot silently change confirmed profile facets.

Profile changes create a new profile version. AI-analysis cache keys include the profile version so an intentional profile change triggers appropriate re-analysis without invalidating unrelated source data.

## Ranking Pipeline

The pipeline is:

1. arXiv and ADS retrieve a broad candidate set through the existing source adapters.
2. Deterministic rules compute a baseline score and reject clearly irrelevant candidates.
3. The AI service analyzes only a bounded set of leading or ambiguous candidates.
4. The ranking service combines rule relevance, AI semantic relevance, and confirmed user feedback.
5. The daily-selection service stores a stable daily result and the topic service aggregates evidence for the radar.

Initial ranking weights are:

- rule relevance: 50%;
- AI semantic relevance: 35%;
- feedback and behavior: 15%.

Weights are implementation configuration rather than user-facing controls in the first release. The score record retains each component and its evidence so ranking remains explainable. When no valid AI analysis exists, the rule and feedback components are normalized into a fallback score instead of treating the missing AI score as zero.

Rule evidence may include profile topic, method, object, author, category, source, freshness, citation information, explicit exclusions, and duplicate status. Strong negative exclusions can remove a candidate before an AI call.

AI analysis handles semantic association, cross-topic discovery, topic assignment, emerging-topic suggestions, and concise recommendation explanations. It does not replace numeric trend calculations or source metadata.

## Daily Selection

The default daily selection contains approximately 5–10 papers. A stored daily selection prevents the list from changing unpredictably on every page refresh. A manual source refresh may add a clearly marked late arrival, but existing entries keep their order until the next daily recomputation unless the profile changes.

Each paper card shows:

- title, authors, source, date, and assigned topics;
- a recommendation reason tied to concrete profile facets or cross-topic evidence;
- a compact explanation of rule, semantic, and feedback contributions;
- a cross-topic-discovery label when semantic relevance is strong but literal rule overlap is weak;
- favorite, read, relevant, and irrelevant actions;
- optional irrelevant-reason choices such as wrong topic, method, object, excessive breadth, or already known.

The interface must not present an AI explanation when analysis failed or did not run.

## Feedback and Learning

Relevant and irrelevant actions are strong signals. Favorite, abstract expansion, source-link opening, and read state are weak signals. A single action cannot make a large profile-wide weight change.

Irrelevant feedback can include a structured reason. The ranking service uses that reason to adjust the relevant facet weight rather than applying an unexplained penalty to superficially similar papers. Feedback remains visible, can be undone, and is included in migration data.

Repeated evidence can generate a proposed profile update, such as increasing interest in a method. The proposal must show its supporting feedback and requires explicit user confirmation.

The first release does not train or fine-tune a model. Learning consists of deterministic preference weights, confirmed profile changes, and contextual prompts built from the current profile and recent feedback.

## Topic Radar

Stable topics derive from confirmed profile facets. A paper may have one primary topic and multiple secondary topics. Assignment combines deterministic evidence with validated AI analysis.

Emerging topics require quantitative evidence before display:

- a configurable minimum number of relevant papers in the last 7 days;
- material growth compared with the prior 30-day baseline or multiple high-relevance papers;
- papers from at least two independent author teams;
- sufficient assignment confidence.

Code calculates counts, growth, team diversity, thresholds, and state. AI may propose a readable name and grounded summary. Low-volume evidence is labeled a recent signal rather than a trend.

Each topic displays 7-day paper volume, change from baseline, high-relevance count, representative papers, active authors or teams, last update time, and one of stable, rising, emerging, or cooling. Every generated summary links to the papers that support it.

Users can rename, merge, split, pause, and reprioritize stable topics. Emerging topics remain suggestions until promoted or dismissed.

## AI Provider and Cost Controls

The first release supports the OpenAI-compatible chat-completions protocol through a provider adapter. Environment defaults include:

- `AI_BASE_URL`;
- `AI_API_KEY`;
- `AI_MODEL`.

The settings interface may override the base URL and model and stores those non-secret values in local settings. `AI_API_KEY` remains environment-only. The interface displays provider availability, selected non-secret configuration, cache and usage status, and a connection test that sends no profile or paper content. The API key is read only by the local server. It is not returned to the client, stored in SQLite, logged, or exported.

AI responses use a versioned structured JSON contract containing semantic relevance, topic assignments, recommendation reason, emerging-topic candidates, confidence, and daily-selection recommendation. Responses are validated before persistence.

Cost and latency are bounded by rule prefiltering, a configurable per-refresh candidate limit, batched requests, a daily analysis limit, and caching. The cache identity includes paper content version, profile version, prompt/schema version, provider base URL, and model name. A refresh must not repeat unchanged analysis.

Trend summaries reuse stored paper analyses rather than submitting complete paper sets again.

## Data Model

New logical records are:

- `research_profiles`: user text, active version, and timestamps;
- `profile_facets`: confirmed topic, object, method, data type, author, and exclusion facets with weights;
- `paper_scores`: rule, semantic, feedback, fallback, and final scores plus evidence and version metadata;
- `paper_ai_analyses`: validated structured output, confidence, provider/model metadata, cache identity, and timestamps;
- `research_topics`: stable or emerging state, label, status, confidence, and lifecycle timestamps;
- `paper_topic_matches`: primary/secondary assignment, evidence, and confidence;
- `paper_feedback`: relevant/irrelevant state, structured reason, source behavior, timestamps, and undo state;
- `daily_selections`: selection date, ordered paper IDs, scoring version, and recomputation reason.

Exact SQL and indexes belong in the implementation plan. Profile, feedback, topic, analysis, and daily-selection records are included in versioned migration archives. Provider credentials are excluded.

## API Boundaries

New local API responsibilities are grouped as:

- `/api/profile` for profile text, parsed-facet preview, confirmation, editing, and version history;
- `/api/radar/daily` for the stored daily selection and explanations;
- `/api/radar/topics` for topic overview, history, paper evidence, and topic management;
- `/api/papers/:id/feedback` for relevant, irrelevant, reason, and undo actions;
- `/api/ai/status` for non-secret provider status, bounded usage, and connection testing.

Shared client/server contracts define all request, response, and AI-analysis shapes. The client does not call the AI provider directly.

## Failure and Degradation

- AI timeout, rate limiting, unavailable provider, and invalid output use finite retry behavior and never block source persistence.
- Invalid AI JSON is rejected rather than partially stored.
- A failed batch leaves its papers eligible for a later retry and displays rule-ranked results without fabricated explanations.
- A source failure preserves cached radar content and follows the existing partial-refresh behavior.
- Insufficient trend evidence suppresses a trend label and records the reason for diagnostics.
- Profile parse failure leaves the user's original description intact and allows manual facet editing.

## Scope

The first release includes profile creation and confirmation, deterministic scoring, bounded OpenAI-compatible analysis, daily selection, stable and emerging topic radar, relevant/irrelevant feedback, explainable ranking, fallback behavior, and migration of the new non-secret data.

It excludes PDF full-text analysis, citation graphs, email or system notifications, multi-user collaboration, cloud synchronization, silent automatic profile mutation, and training or fine-tuning a custom model.

## Testing Strategy

- Unit tests use fixed paper/profile inputs to verify rule scores, exclusions, score normalization, feedback influence, trend thresholds, and deterministic daily ordering.
- AI adapter tests use mocked OpenAI-compatible responses to verify batching, schema validation, caching, finite retry behavior, and secret handling.
- Repository tests verify profile versioning, cache identity, topic lifecycle, feedback undo, and daily-selection stability.
- Integration tests cover AI success, missing configuration, timeout, malformed output, rate limiting, partial batch failure, and rule-only fallback.
- Migration tests verify round trips for the new data and assert that credentials are absent.
- Client tests cover profile review, topic filtering, score explanation, relevant/irrelevant feedback, undo, AI-unavailable state, and narrow-screen behavior.
- End-to-end tests cover profile creation, refresh, daily selection, topic inspection, feedback, and a later ranking change using fixed source and AI fixtures.

Automated tests must not depend on live arXiv, ADS, or AI providers.
