import type { ResearchTopic } from "../../shared/radar";

type Labels = { title: string; stable: string; emerging: string; papers: string };

export const TopicRadar = ({ topics, selectedId, onSelect, labels }: {
  topics: ResearchTopic[];
  selectedId: string | undefined;
  onSelect(id: string | undefined): void;
  labels: Labels;
}) => {
  const section = (kind: ResearchTopic["kind"], heading: string) => {
    const items = topics.filter((topic) => topic.kind === kind);
    return items.length > 0 && <section className="topic-group">
      <h3>{heading}</h3>
      {items.map((topic) => <button
        className={selectedId === topic.id ? "topic-card selected" : "topic-card"}
        key={topic.id}
        onClick={() => onSelect(selectedId === topic.id ? undefined : topic.id)}
      >
        <span><strong>{topic.label}</strong><small>{topic.status}</small></span>
        <span className="topic-count">{topic.paperCount7d} {labels.papers}</span>
        <span className="topic-summary">{topic.summary}</span>
      </button>)}
    </section>;
  };
  return <aside className="topic-radar">
    <div className="radar-heading"><h2>{labels.title}</h2><button onClick={() => onSelect(undefined)}>×</button></div>
    {section("stable", labels.stable)}
    {section("emerging", labels.emerging)}
  </aside>;
};
