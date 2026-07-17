import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import type {
  DailySelection,
  PaperAnalysis,
  PaperFeedback,
  PaperFeedbackInput,
  PaperScore,
  ProfileFacet,
  ProfileFacetInput,
  ResearchProfile,
  ResearchTopic,
} from "../../shared/radar";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

export class RadarRepository {
  constructor(
    private readonly database: Database.Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  getActiveProfile(): ResearchProfile | null {
    const row = this.database.prepare(
      "SELECT id, text, version, active, created_at FROM research_profiles WHERE active = 1 ORDER BY version DESC LIMIT 1",
    ).get() as { id: string; text: string; version: number; active: number; created_at: string } | undefined;
    return row ? { id: row.id, text: row.text, version: row.version, active: Boolean(row.active), createdAt: row.created_at } : null;
  }

  confirmProfile(text: string, facets: ProfileFacetInput[]): ResearchProfile {
    return this.database.transaction(() => {
      const versionRow = this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM research_profiles").get() as { version: number };
      const profile: ResearchProfile = {
        id: randomUUID(),
        text,
        version: versionRow.version + 1,
        active: true,
        createdAt: this.clock().toISOString(),
      };
      this.database.prepare("UPDATE research_profiles SET active = 0 WHERE active = 1").run();
      this.database.prepare("INSERT INTO research_profiles(id, text, version, active, created_at) VALUES (?, ?, ?, 1, ?)")
        .run(profile.id, profile.text, profile.version, profile.createdAt);
      const insertFacet = this.database.prepare(
        "INSERT INTO profile_facets(id, profile_id, kind, value, weight) VALUES (?, ?, ?, ?, ?)",
      );
      for (const facet of facets) insertFacet.run(randomUUID(), profile.id, facet.kind, facet.value, facet.weight);
      return profile;
    })();
  }

  listFacets(profileId: string): ProfileFacet[] {
    const rows = this.database.prepare(
      "SELECT id, profile_id, kind, value, weight FROM profile_facets WHERE profile_id = ? ORDER BY rowid",
    ).all(profileId) as Array<{ id: string; profile_id: string; kind: ProfileFacet["kind"]; value: string; weight: number }>;
    return rows.map((row) => ({ id: row.id, profileId: row.profile_id, kind: row.kind, value: row.value, weight: row.weight }));
  }

  saveAnalysis(value: PaperAnalysis): void {
    this.database.prepare(`
      INSERT INTO paper_ai_analyses(cache_key, paper_id, profile_version, semantic_score, topics_json, reason,
        emerging_topics_json, confidence, recommend, provider_base_url, model, schema_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET semantic_score = excluded.semantic_score, topics_json = excluded.topics_json,
        reason = excluded.reason, emerging_topics_json = excluded.emerging_topics_json, confidence = excluded.confidence,
        recommend = excluded.recommend, created_at = excluded.created_at
    `).run(value.cacheKey, value.paperId, value.profileVersion, value.semanticScore, JSON.stringify(value.topics), value.reason,
      JSON.stringify(value.emergingTopicCandidates), value.confidence, value.recommend ? 1 : 0, value.providerBaseUrl,
      value.model, value.schemaVersion, value.createdAt);
  }

  findAnalysis(cacheKey: string): PaperAnalysis | null {
    const row = this.database.prepare("SELECT * FROM paper_ai_analyses WHERE cache_key = ?").get(cacheKey) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      paperId: String(row.paper_id), cacheKey: String(row.cache_key), profileVersion: Number(row.profile_version),
      semanticScore: Number(row.semantic_score), topics: parseJson<string[]>(String(row.topics_json)), reason: String(row.reason),
      emergingTopicCandidates: parseJson<string[]>(String(row.emerging_topics_json)), confidence: Number(row.confidence),
      recommend: Boolean(row.recommend), providerBaseUrl: String(row.provider_base_url), model: String(row.model),
      schemaVersion: Number(row.schema_version), createdAt: String(row.created_at),
    };
  }

  listAnalyses(profileVersion: number): PaperAnalysis[] {
    const keys = this.database.prepare(
      "SELECT cache_key FROM paper_ai_analyses WHERE profile_version = ? ORDER BY rowid",
    ).all(profileVersion) as Array<{ cache_key: string }>;
    return keys.map(({ cache_key }) => this.findAnalysis(cache_key)).filter((value): value is PaperAnalysis => value !== null);
  }

  saveScore(value: PaperScore): void {
    this.database.prepare(`
      INSERT INTO paper_scores(paper_id, profile_version, rule_score, semantic_score, feedback_score, final_score, mode, evidence_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(paper_id, profile_version) DO UPDATE SET rule_score = excluded.rule_score, semantic_score = excluded.semantic_score,
        feedback_score = excluded.feedback_score, final_score = excluded.final_score, mode = excluded.mode,
        evidence_json = excluded.evidence_json, created_at = excluded.created_at
    `).run(value.paperId, value.profileVersion, value.rule, value.semantic, value.feedback, value.final, value.mode,
      JSON.stringify(value.evidence), value.createdAt);
  }

  getScore(paperId: string, profileVersion: number): PaperScore | null {
    const row = this.database.prepare("SELECT * FROM paper_scores WHERE paper_id = ? AND profile_version = ?")
      .get(paperId, profileVersion) as Record<string, unknown> | undefined;
    return row ? {
      paperId: String(row.paper_id), profileVersion: Number(row.profile_version), rule: Number(row.rule_score),
      semantic: row.semantic_score === null ? null : Number(row.semantic_score), feedback: Number(row.feedback_score),
      final: Number(row.final_score), mode: row.mode as PaperScore["mode"],
      evidence: parseJson<PaperScore["evidence"]>(String(row.evidence_json)), createdAt: String(row.created_at),
    } : null;
  }

  listScores(profileVersion: number): PaperScore[] {
    const ids = this.database.prepare(
      "SELECT paper_id FROM paper_scores WHERE profile_version = ? ORDER BY rowid",
    ).all(profileVersion) as Array<{ paper_id: string }>;
    return ids.map(({ paper_id }) => this.getScore(paper_id, profileVersion)).filter((value): value is PaperScore => value !== null);
  }

  saveFeedback(input: PaperFeedbackInput): PaperFeedback {
    const value: PaperFeedback = { ...input, id: randomUUID(), createdAt: this.clock().toISOString() };
    this.database.prepare("INSERT INTO paper_feedback(id, paper_id, relevance, reason, undone, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(value.id, value.paperId, value.relevance, value.reason, value.undone ? 1 : 0, value.createdAt);
    return value;
  }

  listFeedback(paperId?: string): PaperFeedback[] {
    const rows = (paperId
      ? this.database.prepare("SELECT * FROM paper_feedback WHERE paper_id = ? ORDER BY rowid").all(paperId)
      : this.database.prepare("SELECT * FROM paper_feedback ORDER BY rowid").all()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), paperId: String(row.paper_id), relevance: row.relevance as PaperFeedback["relevance"],
      reason: row.reason as PaperFeedback["reason"], undone: Boolean(row.undone), createdAt: String(row.created_at),
    }));
  }

  undoFeedback(paperId: string): PaperFeedback | null {
    const row = this.database.prepare(
      "SELECT id FROM paper_feedback WHERE paper_id = ? AND undone = 0 ORDER BY rowid DESC LIMIT 1",
    ).get(paperId) as { id: string } | undefined;
    if (!row) return null;
    this.database.prepare("UPDATE paper_feedback SET undone = 1 WHERE id = ?").run(row.id);
    return this.listFeedback(paperId).find((item) => item.id === row.id) ?? null;
  }

  saveTopics(topics: ResearchTopic[]): void {
    const statement = this.database.prepare(`
      INSERT INTO research_topics(id, profile_version, kind, label, status, confidence, paper_count_7d,
        high_relevance_count, baseline_change, representative_paper_ids_json, active_teams_json, summary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, confidence = excluded.confidence,
        paper_count_7d = excluded.paper_count_7d, high_relevance_count = excluded.high_relevance_count,
        baseline_change = excluded.baseline_change, representative_paper_ids_json = excluded.representative_paper_ids_json,
        active_teams_json = excluded.active_teams_json, summary = excluded.summary, updated_at = excluded.updated_at
    `);
    this.database.transaction(() => {
      for (const topic of topics) statement.run(topic.id, topic.profileVersion, topic.kind, topic.label, topic.status,
        topic.confidence, topic.paperCount7d, topic.highRelevanceCount, topic.baselineChange,
        JSON.stringify(topic.representativePaperIds), JSON.stringify(topic.activeTeams), topic.summary, topic.updatedAt);
    })();
  }

  listTopics(profileVersion: number): ResearchTopic[] {
    const rows = this.database.prepare("SELECT * FROM research_topics WHERE profile_version = ? ORDER BY rowid")
      .all(profileVersion) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), profileVersion: Number(row.profile_version), kind: row.kind as ResearchTopic["kind"],
      label: String(row.label), status: row.status as ResearchTopic["status"], confidence: Number(row.confidence),
      paperCount7d: Number(row.paper_count_7d), highRelevanceCount: Number(row.high_relevance_count),
      baselineChange: Number(row.baseline_change),
      representativePaperIds: parseJson<string[]>(String(row.representative_paper_ids_json)),
      activeTeams: parseJson<string[]>(String(row.active_teams_json)), summary: String(row.summary), updatedAt: String(row.updated_at),
    }));
  }

  saveDailySelection(value: DailySelection): void {
    this.database.prepare(`
      INSERT INTO daily_selections(date, profile_version, paper_ids_json, mode, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, profile_version) DO UPDATE SET paper_ids_json = excluded.paper_ids_json,
        mode = excluded.mode, created_at = excluded.created_at
    `).run(value.date, value.profileVersion, JSON.stringify(value.paperIds), value.mode, value.createdAt);
  }

  getDailySelection(date: string, profileVersion: number): DailySelection | null {
    const row = this.database.prepare("SELECT * FROM daily_selections WHERE date = ? AND profile_version = ?")
      .get(date, profileVersion) as Record<string, unknown> | undefined;
    return row ? {
      date: String(row.date), profileVersion: Number(row.profile_version),
      paperIds: parseJson<string[]>(String(row.paper_ids_json)), mode: row.mode as DailySelection["mode"],
      createdAt: String(row.created_at),
    } : null;
  }
}
