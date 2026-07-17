import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { z, ZodError } from "zod";

import { feedQuerySchema, type SourceName } from "../shared/contracts";
import type { Repository } from "./db/repository";
import type { RefreshService } from "./services/refresh";
import type { SearchService } from "./services/search";

type AppDependencies = {
  repository: Repository;
  search: SearchService;
  refresh: RefreshService;
  configuredSources: SourceName[];
};

const querySchema = z.object({ query: z.string().trim().min(1).max(500) });
const searchPatchSchema = z.object({ query: z.string().trim().min(1).max(500).optional(), enabled: z.boolean().optional() });
const paperStateSchema = z.object({ favorite: z.boolean().optional(), read: z.boolean().optional() }).refine(
  (value) => value.favorite !== undefined || value.read !== undefined,
);
const settingsSchema = z.object({ language: z.enum(["zh", "en"]) });

const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export const createApp = ({ repository, search, refresh, configuredSources }: AppDependencies) => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/status", (_request, response) => {
    response.json({
      data: {
        sources: {
          arxiv: { available: configuredSources.includes("arxiv") },
          ads: { available: configuredSources.includes("ads") },
        },
      },
    });
  });

  app.get("/api/searches", (_request, response) => response.json({ data: repository.listSearches() }));
  app.post("/api/searches", (request, response) => {
    const { query } = querySchema.parse(request.body);
    response.status(201).json({ data: repository.createSearch(query) });
  });
  app.patch("/api/searches/:id", (request, response) => {
    const updated = repository.updateSearch(String(request.params.id), searchPatchSchema.parse(request.body));
    if (!updated) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Saved search not found" } });
    return response.json({ data: updated });
  });
  app.delete("/api/searches/:id", (request, response) => {
    if (!repository.deleteSearch(String(request.params.id))) {
      return response.status(404).json({ error: { code: "NOT_FOUND", message: "Saved search not found" } });
    }
    return response.status(204).end();
  });

  app.get("/api/papers", (request, response) => {
    const query = feedQuerySchema.parse(request.query);
    response.json({ data: repository.listPapers(query) });
  });
  app.patch("/api/papers/:id/state", (request, response) => {
    if (!repository.setPaperState(String(request.params.id), paperStateSchema.parse(request.body))) {
      return response.status(404).json({ error: { code: "NOT_FOUND", message: "Paper not found" } });
    }
    return response.json({ data: { updated: true } });
  });

  app.post("/api/search", asyncRoute(async (request, response) => {
    const { query } = querySchema.parse(request.body);
    response.json({ data: await search.temporarySearch(query) });
  }));
  app.post("/api/refresh", asyncRoute(async (request, response) => {
    const ids = z.object({ searchIds: z.array(z.string()).optional() }).parse(request.body ?? {}).searchIds;
    response.json({ data: await refresh.refreshSaved(ids) });
  }));

  app.get("/api/settings", (_request, response) => {
    response.json({ data: { language: repository.getSetting("language", "zh") } });
  });
  app.patch("/api/settings", (request, response) => {
    const settings = settingsSchema.parse(request.body);
    repository.setSetting("language", settings.language);
    response.json({ data: settings });
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "API route not found" } });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ZodError) {
      response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } });
      return;
    }
    response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  };
  app.use(errorHandler);
  return app;
};
