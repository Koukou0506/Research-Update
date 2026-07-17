import type { SavedSearch } from "../../shared/contracts";

type Props = {
  heading: string;
  searches: SavedSearch[];
  selectedId?: string;
  labels: { all: string; pause: string; resume: string; remove: string; migration: string };
  onSelect(id?: string): void;
  onToggle(search: SavedSearch): void;
  onDelete(id: string): void;
  onMigration(): void;
};

export const SavedSearchNav = ({ heading, searches, selectedId, labels, onSelect, onToggle, onDelete, onMigration }: Props) => (
  <aside className="sidebar">
    <div className="sidebar-heading"><strong>{heading}</strong><span>{searches.length}</span></div>
    <button className={!selectedId ? "nav-item active" : "nav-item"} onClick={() => onSelect()}>{labels.all}</button>
    {searches.map((search) => (
      <div className={selectedId === search.id ? "saved-search active" : "saved-search"} key={search.id}>
        <button className="search-name" onClick={() => onSelect(search.id)}>{search.query}</button>
        <div className="search-actions">
          <button onClick={() => onToggle(search)}>{search.enabled ? labels.pause : labels.resume}</button>
          <button onClick={() => onDelete(search.id)}>{labels.remove}</button>
        </div>
      </div>
    ))}
    <button className="migration-link" onClick={onMigration}>{labels.migration}</button>
  </aside>
);
