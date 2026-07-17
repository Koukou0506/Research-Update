import { useMemo, useState } from "react";

import type { DailyRadarView, PaperFeedback, ResearchTopic } from "../../shared/radar";

type FeedbackInput = { relevance: "relevant" | "irrelevant"; reason: PaperFeedback["reason"] };
type Labels = {
  title: string; ruleOnly: string; why: string; relevant: string; irrelevant: string; confirmReason: string;
  reasonLabel: string; wrongTopic: string; wrongMethod: string; wrongObject: string; tooBroad: string;
  alreadyKnown: string; abstract: string; empty: string;
};

export const DailySelection = ({ view, selectedTopic, onFeedback, onState, labels }: {
  view: DailyRadarView;
  selectedTopic: ResearchTopic | undefined;
  onFeedback(paperId: string, input: FeedbackInput): Promise<void>;
  labels: Labels & { favorite?: string; unfavorite?: string; markRead?: string; markUnread?: string };
  onState?(paperId: string, patch: { favorite?: boolean; read?: boolean }): Promise<void>;
}) => {
  const [rejecting, setRejecting] = useState<string>();
  const [reason, setReason] = useState<NonNullable<PaperFeedback["reason"]>>("wrong-topic");
  const scores = useMemo(() => new Map(view.scores.map((score) => [score.paperId, score])), [view.scores]);
  const analyses = useMemo(() => new Map(view.analyses.map((analysis) => [analysis.paperId, analysis])), [view.analyses]);
  const papers = selectedTopic ? view.papers.filter((paper) => {
    const analysis = analyses.get(paper.id);
    return selectedTopic.representativePaperIds.includes(paper.id) || analysis?.topics.includes(selectedTopic.label) ||
      analysis?.emergingTopicCandidates.includes(selectedTopic.label);
  }) : view.papers;
  const reasons = [
    ["wrong-topic", labels.wrongTopic], ["wrong-method", labels.wrongMethod], ["wrong-object", labels.wrongObject],
    ["too-broad", labels.tooBroad], ["already-known", labels.alreadyKnown],
  ] as const;

  return <main className="daily-selection">
    <div className="feed-heading"><h2>{labels.title}</h2><span>{papers.length}</span></div>
    {view.selection.mode === "rule-only" && <p className="radar-notice">{labels.ruleOnly}</p>}
    {papers.length === 0 && <p className="empty-state">{labels.empty}</p>}
    {papers.map((paper) => {
      const score = scores.get(paper.id);
      const analysis = analyses.get(paper.id);
      return <article className="paper-card radar-paper" key={paper.id}>
        <div className="paper-meta">{paper.sources.join(" + ").toUpperCase()} · {new Date(paper.publishedAt).toLocaleDateString()}</div>
        {score && <span className="relevance-score">{Math.round(score.final)}</span>}
        <h3>{paper.title}</h3>
        <p className="authors">{paper.authors.join(", ")}{paper.journal ? ` · ${paper.journal}` : ""}</p>
        {analysis && <div className="recommendation"><strong>{labels.why}</strong><p>{analysis.reason}</p>
          <div>{analysis.topics.map((topic) => <span className="topic-pill" key={topic}>{topic}</span>)}</div></div>}
        {score && <div className="score-breakdown"><span>Rule {Math.round(score.rule)}</span><span>AI {score.semantic === null ? "—" : Math.round(score.semantic)}</span><span>Feedback {Math.round(score.feedback)}</span></div>}
        <details><summary>{labels.abstract}</summary><p>{paper.abstract}</p></details>
        <div className="paper-footer">
          {Object.entries(paper.sourceUrls).map(([source, url]) => <a key={source} href={url} target="_blank" rel="noreferrer">{source.toUpperCase()} ↗</a>)}
          {onState && <button onClick={() => void onState(paper.id, { favorite: !paper.favorite })}>{paper.favorite ? labels.unfavorite : labels.favorite}</button>}
          {onState && <button onClick={() => void onState(paper.id, { read: !paper.read })}>{paper.read ? labels.markUnread : labels.markRead}</button>}
          <button onClick={() => void onFeedback(paper.id, { relevance: "relevant", reason: null })}>{labels.relevant}</button>
          <button onClick={() => setRejecting(paper.id)}>{labels.irrelevant}</button>
        </div>
        {rejecting === paper.id && <div className="feedback-reason">
          <label>{labels.reasonLabel}<select aria-label={labels.reasonLabel} value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
            {reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <button onClick={() => { void onFeedback(paper.id, { relevance: "irrelevant", reason }); setRejecting(undefined); }}>{labels.confirmReason}</button>
        </div>}
      </article>;
    })}
  </main>;
};
