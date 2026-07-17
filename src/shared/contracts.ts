import { z } from "zod";

export type SourceName = "arxiv" | "ads";

export type Paper = {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  publishedAt: string;
  journal: string | null;
  doi: string | null;
  arxivId: string | null;
  bibcode: string | null;
  citationCount: number | null;
  sources: SourceName[];
  sourceUrls: Partial<Record<SourceName, string>>;
  matchedSearchIds: string[];
  favorite: boolean;
  read: boolean;
};

export type SavedSearch = {
  id: string;
  query: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceStatus = {
  source: SourceName;
  available: boolean;
  state: "idle" | "refreshing" | "ok" | "error";
  message: string | null;
};

export const feedQuerySchema = z.object({
  sort: z.enum(["latest", "oldest", "citations"]).default("latest"),
  searchId: z.string().optional(),
  source: z.enum(["arxiv", "ads"]).optional(),
  state: z.enum(["all", "unread", "favorites", "read"]).default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
