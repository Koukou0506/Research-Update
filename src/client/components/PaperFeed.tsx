import type { Paper } from "../../shared/contracts";

type Props = {
  papers: Paper[];
  title: string;
  empty: string;
  labels: { favorite: string; unfavorite: string; markRead: string; markUnread: string; abstract: string };
  onState(id: string, patch: Partial<Pick<Paper, "favorite" | "read">>): void;
};

export const PaperFeed = ({ papers, title, empty, labels, onState }: Props) => (
  <section className="feed">
    <div className="feed-heading"><h2>{title}</h2><span>{papers.length}</span></div>
    {papers.length === 0 && <p className="empty-state">{empty}</p>}
    {papers.map((paper) => (
      <article className="paper-card" key={paper.id}>
        <div className="paper-meta">{paper.sources.join(" + ").toUpperCase()} · {new Date(paper.publishedAt).toLocaleDateString()}</div>
        <h3>{paper.title}</h3>
        <p className="authors">{paper.authors.join(", ")}{paper.journal ? ` · ${paper.journal}` : ""}</p>
        <details><summary>{labels.abstract}</summary><p>{paper.abstract}</p></details>
        <div className="paper-footer">
          {Object.entries(paper.sourceUrls).map(([source, url]) => <a key={source} href={url} target="_blank" rel="noreferrer">{source.toUpperCase()} ↗</a>)}
          {paper.citationCount !== null && <span>Citations: {paper.citationCount}</span>}
          <button onClick={() => onState(paper.id, { favorite: !paper.favorite })}>{paper.favorite ? labels.unfavorite : labels.favorite}</button>
          <button onClick={() => onState(paper.id, { read: !paper.read })}>{paper.read ? labels.markUnread : labels.markRead}</button>
        </div>
      </article>
    ))}
  </section>
);
