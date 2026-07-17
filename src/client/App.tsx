import { useCallback, useEffect, useMemo, useState } from "react";

import type { FeedQuery, Paper, SavedSearch, SourceName } from "../shared/contracts";
import type { ResearchApi, SourceRun } from "./api";
import { api as defaultApi } from "./api";
import { Header } from "./components/Header";
import { MigrationPanel } from "./components/MigrationPanel";
import { PaperFeed } from "./components/PaperFeed";
import { SavedSearchNav } from "./components/SavedSearchNav";
import { translate, type Language } from "./i18n";

export const App = ({ api = defaultApi }: { api?: ResearchApi }) => {
  const [language, setLanguage] = useState<Language>("zh");
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [query, setQuery] = useState("");
  const [temporaryQuery, setTemporaryQuery] = useState("");
  const [selectedSearchId, setSelectedSearchId] = useState<string>();
  const [source, setSource] = useState<SourceName>();
  const [state, setState] = useState<FeedQuery["state"]>("all");
  const [sort, setSort] = useState<FeedQuery["sort"]>("latest");
  const [status, setStatus] = useState<Record<SourceName, { available: boolean }>>({ arxiv: { available: true }, ads: { available: false } });
  const [runs, setRuns] = useState<Partial<Record<SourceName, SourceRun>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMigration, setShowMigration] = useState(false);

  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(language, key), [language]);
  const feedQuery = useMemo(() => ({ sort, state, searchId: selectedSearchId, source }), [sort, state, selectedSearchId, source]);
  const reloadPapers = useCallback(async () => setPapers(await api.listPapers(feedQuery)), [api, feedQuery]);

  useEffect(() => {
    let active = true;
    void Promise.all([api.getSettings(), api.getStatus(), api.listSearches(), api.listPapers(feedQuery)]).then(
      ([settings, nextStatus, nextSearches, nextPapers]) => {
        if (!active) return;
        setLanguage(settings.language);
        setStatus(nextStatus);
        setSearches(nextSearches);
        setPapers(nextPapers);
        setLoading(false);
        setRefreshing(true);
        void api.refresh().then((result) => { if (active) setRuns(result.sources); }).finally(() => { if (active) { setRefreshing(false); void reloadPapers(); } });
      },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => { if (!loading && !temporaryQuery) void reloadPapers(); }, [feedQuery]);

  const switchLanguage = async () => {
    const next = language === "zh" ? "en" : "zh";
    setLanguage(next);
    await api.updateSettings(next);
  };
  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const result = await api.temporarySearch(trimmed);
    setTemporaryQuery(trimmed);
    setPapers(result.papers);
    setRuns(result.sources);
  };
  const saveTemporary = async () => {
    const created = await api.createSearch(temporaryQuery);
    setSearches((current) => [...current, created]);
    setSelectedSearchId(created.id);
    setTemporaryQuery("");
  };
  const refresh = async () => {
    setRefreshing(true);
    try { setRuns((await api.refresh(selectedSearchId ? [selectedSearchId] : undefined)).sources); await reloadPapers(); }
    finally { setRefreshing(false); }
  };
  const updateState = async (id: string, patch: Partial<Pick<Paper, "favorite" | "read">>) => {
    setPapers((current) => current.map((paper) => paper.id === id ? { ...paper, ...patch } : paper));
    await api.updatePaperState(id, patch);
  };

  const partial = Object.values(runs).some((run) => run?.state === "error");
  return (
    <div className="app-shell">
      <Header language={language} query={query} searchLabel={t("search")} refreshLabel={t("refresh")} placeholder={t("searchPlaceholder")} refreshing={refreshing} onLanguageChange={switchLanguage} onQueryChange={setQuery} onSearch={runSearch} onRefresh={refresh} />
      <div className="source-status"><span>arXiv</span><span>{status.ads.available ? "ADS" : t("adsUnavailable")}</span>{partial && <strong>{t("sourcePartial")}</strong>}</div>
      {temporaryQuery && <div className="temporary-banner"><span>{temporaryQuery}</span><button onClick={saveTemporary}>{t("saveSearch")}</button></div>}
      <div className="workspace">
        <SavedSearchNav heading={t("following")} searches={searches} selectedId={selectedSearchId} labels={{ all: t("allPapers"), pause: t("pause"), resume: t("resume"), remove: t("remove"), migration: t("dataMigration") }} onSelect={(id) => { setSelectedSearchId(id); setTemporaryQuery(""); }} onToggle={async (search) => { const updated = await api.updateSearch(search.id, { enabled: !search.enabled }); setSearches((items) => items.map((item) => item.id === updated.id ? updated : item)); }} onDelete={async (id) => { await api.deleteSearch(id); setSearches((items) => items.filter((item) => item.id !== id)); if (selectedSearchId === id) setSelectedSearchId(undefined); }} onMigration={() => setShowMigration(true)} />
        <main className="content">
          <div className="feed-controls">
            <select aria-label="source" value={source ?? ""} onChange={(event) => setSource((event.target.value || undefined) as SourceName | undefined)}><option value="">{t("allSources")}</option><option value="arxiv">arXiv</option><option value="ads">ADS</option></select>
            <select aria-label="state" value={state} onChange={(event) => setState(event.target.value as FeedQuery["state"])}><option value="all">{t("allPapers")}</option><option value="unread">{t("unread")}</option><option value="favorites">{t("favorites")}</option><option value="read">{t("read")}</option></select>
            <select aria-label="sort" value={sort} onChange={(event) => setSort(event.target.value as FeedQuery["sort"])}><option value="latest">{t("latest")}</option><option value="oldest">{t("oldest")}</option><option value="citations">{t("citations")}</option></select>
          </div>
          {loading ? <p>{t("loading")}</p> : showMigration ? <MigrationPanel api={api} title={t("dataMigration")} labels={{ exportZip: t("exportZip"), chooseZip: t("chooseZip"), preview: t("preview"), restore: t("restore") }} onRestored={() => { setShowMigration(false); void Promise.all([api.listSearches(), api.listPapers(feedQuery)]).then(([nextSearches, nextPapers]) => { setSearches(nextSearches); setPapers(nextPapers); }); }} /> : <PaperFeed papers={papers} title={t("latestPapers")} empty={t("noPapers")} labels={{ favorite: t("favorite"), unfavorite: t("unfavorite"), markRead: t("markRead"), markUnread: t("markUnread"), abstract: t("abstract") }} onState={updateState} />}
        </main>
      </div>
    </div>
  );
};
