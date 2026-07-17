import { useState } from "react";
import type { MigrationPreview, ResearchApi } from "../api";

type Props = { api: ResearchApi; title: string; labels: { exportZip: string; chooseZip: string; preview: string; restore: string }; onRestored(): void };

export const MigrationPanel = ({ api, title, labels, onRestored }: Props) => {
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<MigrationPreview>();
  const exportZip = async () => {
    const blob = await api.exportArchive();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "research-update.zip";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="migration-panel">
      <h2>{title}</h2>
      <button onClick={exportZip}>{labels.exportZip}</button>
      <label>{labels.chooseZip}<input type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0]); setPreview(undefined); }} /></label>
      <button disabled={!file} onClick={async () => file && setPreview(await api.previewArchive(file))}>{labels.preview}</button>
      {preview && <div className="migration-preview"><p>{preview.createdAt}</p><p>Searches: {preview.searches} · Papers: {preview.papers} · Favorites: {preview.favorites}</p><button onClick={async () => { if (file) { await api.restoreArchive(file); onRestored(); } }}>{labels.restore}</button></div>}
    </section>
  );
};
