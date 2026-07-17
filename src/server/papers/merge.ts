import { createHash } from "node:crypto";

import type { Paper, SourceName } from "../../shared/contracts";
import type { SourcePaper } from "../sources/types";

const normalizeDoi = (value: string | null): string | null =>
  value
    ?.trim()
    .toLowerCase()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "") || null;

const normalizeArxivId = (value: string | null): string | null =>
  value?.trim().replace(/^arxiv:/i, "").replace(/v\d+$/i, "") || null;

const normalizeTitle = (value: string): string =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const publicationYear = (paper: SourcePaper): string => paper.publishedAt.slice(0, 4);

const identityKeys = (paper: SourcePaper): string[] => {
  const keys: string[] = [];
  const doi = normalizeDoi(paper.doi);
  const arxivId = normalizeArxivId(paper.arxivId);
  if (doi) keys.push(`doi:${doi}`);
  if (arxivId) keys.push(`arxiv:${arxivId}`);
  if (paper.bibcode?.trim()) keys.push(`ads:${paper.bibcode.trim()}`);
  keys.push(`title:${normalizeTitle(paper.title)}:${publicationYear(paper)}`);
  return keys;
};

export const canonicalPaperId = (paper: SourcePaper): string => {
  const doi = normalizeDoi(paper.doi);
  if (doi) return `doi:${doi}`;
  const arxivId = normalizeArxivId(paper.arxivId);
  if (arxivId) return `arxiv:${arxivId}`;
  if (paper.bibcode?.trim()) return `ads:${paper.bibcode.trim()}`;
  const fallback = `${normalizeTitle(paper.title)}:${publicationYear(paper)}`;
  return `title:${createHash("sha256").update(fallback).digest("hex").slice(0, 24)}`;
};

const groupRecords = (records: SourcePaper[]): SourcePaper[][] => {
  const groups: SourcePaper[][] = [];
  const keyToGroup = new Map<string, number>();

  for (const record of records) {
    const keys = identityKeys(record);
    const matchingIndexes = [...new Set(keys.map((key) => keyToGroup.get(key)).filter((value) => value !== undefined))] as number[];
    const targetIndex = matchingIndexes[0] ?? groups.length;
    if (!groups[targetIndex]) groups[targetIndex] = [];
    groups[targetIndex].push(record);

    for (const index of matchingIndexes.slice(1)) {
      const merged = groups[index] ?? [];
      groups[targetIndex].push(...merged);
      groups[index] = [];
      for (const mergedRecord of merged) {
        for (const key of identityKeys(mergedRecord)) keyToGroup.set(key, targetIndex);
      }
    }
    for (const key of keys) keyToGroup.set(key, targetIndex);
  }

  return groups.filter((group) => group.length > 0);
};

const newestFirst = (left: SourcePaper, right: SourcePaper): number =>
  (right.updatedAt ?? right.publishedAt).localeCompare(left.updatedAt ?? left.publishedAt);

const mergeGroup = (group: SourcePaper[]): Paper => {
  const ordered = [...group].sort(newestFirst);
  const firstWith = <K extends keyof SourcePaper>(key: K): SourcePaper[K] | null =>
    ordered.find((paper) => paper[key] !== null && paper[key] !== "")?.[key] ?? null;
  const doi = normalizeDoi(firstWith("doi") as string | null);
  const arxivId = normalizeArxivId(firstWith("arxivId") as string | null);
  const bibcode = firstWith("bibcode") as string | null;
  const sources = [...new Set(group.map((paper) => paper.source))].sort() as SourceName[];
  const sourceUrls = Object.fromEntries(group.map((paper) => [paper.source, paper.url]));
  const identityRecord: SourcePaper = { ...ordered[0], doi, arxivId, bibcode };

  return {
    id: canonicalPaperId(identityRecord),
    title: firstWith("title") as string,
    abstract: firstWith("abstract") as string,
    authors: [...ordered].sort((left, right) => right.authors.length - left.authors.length)[0].authors,
    publishedAt: group.map((paper) => paper.publishedAt).sort()[0],
    journal: firstWith("journal") as string | null,
    doi,
    arxivId,
    bibcode,
    citationCount: Math.max(...group.map((paper) => paper.citationCount ?? -1), -1) < 0
      ? null
      : Math.max(...group.map((paper) => paper.citationCount ?? -1)),
    sources,
    sourceUrls,
    matchedSearchIds: [],
    favorite: false,
    read: false,
  };
};

export const mergeSourcePapers = (records: SourcePaper[]): Paper[] => groupRecords(records).map(mergeGroup);
