import { useState } from "react";

import type { ProfileFacetInput, ResearchProfile } from "../../shared/radar";

type ProfileApi = {
  previewProfile(text: string): Promise<ProfileFacetInput[]>;
  confirmProfile(text: string, facets: ProfileFacetInput[]): Promise<{ profile: ResearchProfile; facets: ProfileFacetInput[] }>;
};

type Labels = { title: string; description: string; parse: string; confirm: string; addFacet: string };

export const ProfileSetup = ({ api, onConfirmed, labels }: {
  api: ProfileApi;
  onConfirmed(value: { profile: ResearchProfile; facets: ProfileFacetInput[] }): void;
  labels: Labels;
}) => {
  const [text, setText] = useState("");
  const [facets, setFacets] = useState<ProfileFacetInput[]>([]);
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true);
    try { setFacets(await api.previewProfile(text)); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { onConfirmed(await api.confirmProfile(text, facets)); } finally { setBusy(false); }
  };
  const update = (index: number, patch: Partial<ProfileFacetInput>) => {
    setFacets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  return (
    <main className="profile-setup">
      <p className="eyebrow">PERSONAL RESEARCH RADAR</p>
      <h1>{labels.title}</h1>
      <textarea aria-label={labels.description} value={text} onChange={(event) => setText(event.target.value)} rows={7} />
      <button disabled={busy || text.trim().length < 10} onClick={() => void preview()}>{labels.parse}</button>
      {facets.length > 0 && <section className="facet-editor">
        {facets.map((facet, index) => <div className="facet-row" key={`${facet.kind}-${index}`}>
          <select value={facet.kind} onChange={(event) => update(index, { kind: event.target.value as ProfileFacetInput["kind"] })}>
            {(["topic", "object", "method", "data-type", "author", "exclude"] as const).map((kind) => <option key={kind}>{kind}</option>)}
          </select>
          <input value={facet.value} onChange={(event) => update(index, { value: event.target.value })} />
          <input aria-label="weight" type="number" min="0" max="1" step="0.1" value={facet.weight} onChange={(event) => update(index, { weight: Number(event.target.value) })} />
        </div>)}
        <button onClick={() => setFacets((items) => [...items, { kind: "topic", value: "", weight: 1 }])}>{labels.addFacet}</button>
        <button disabled={busy || facets.some((facet) => !facet.value.trim())} onClick={() => void confirm()}>{labels.confirm}</button>
      </section>}
    </main>
  );
};
