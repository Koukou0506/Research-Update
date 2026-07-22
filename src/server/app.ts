import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import multer from "multer";
import { z, ZodError } from "zod";

import { feedQuerySchema, type SourceName } from "../shared/contracts";
import { paperFeedbackInputSchema, profileFacetInputSchema } from "../shared/radar";
import type { Repository } from "./db/repository";
import type { AiProvider } from "./radar/ai/types";
import type { ProfileService } from "./radar/profileService";
import type { RadarService } from "./radar/radarService";
import type { TopicService } from "./radar/topicService";
import type { RefreshService } from "./services/refresh";
import type { SearchService } from "./services/search";
import type { MigrationService } from "./services/migration";

type AppDependencies = {
  repository: Repository;
  search: SearchService;
  refresh: RefreshService;
  migration?: MigrationService;
  profile?: ProfileService;
  radar?: RadarService;
  topics?: TopicService;
  ai?: AiProvider;
  configuredSources: SourceName[];
};

const querySchema = z.object({ query: z.string().trim().min(1).max(500) });
const searchPatchSchema = z.object({ query: z.string().trim().min(1).max(500).optional(), enabled: z.boolean().optional() });
const paperStateSchema = z.object({ favorite: z.boolean().optional(), read: z.boolean().optional() }).refine(
  (value) => value.favorite !== undefined || value.read !== undefined,
);
const settingsSchema = z.object({ language: z.enum(["zh", "en"]) });
const profileTextSchema = z.object({ text: z.string().trim().min(10).max(5_000) });
const profileConfirmSchema = profileTextSchema.extend({ facets: z.array(profileFacetInputSchema).min(1).max(30) });
const radarQuerySchema = z.object({ refresh: z.literal("true").optional() });

const asyncRoute = (handler: RequestHandler): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};

export const createApp = ({ repository, search, refresh, migration, profile, radar, topics, ai, configuredSources }: AppDependencies) => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
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

  app.get("/api/profile", (_request, response) => {
    if (!profile) return response.json({ data: { profile: null, facets: [] } });
    return response.json({ data: profile.getActiveState() ?? { profile: null, facets: [] } });
  });
  app.post("/api/profile/preview", asyncRoute(async (request, response) => {
    if (!profile) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Research profile unavailable" } });
    const { text } = profileTextSchema.parse(request.body);
    return response.json({ data: { facets: await profile.preview(text) } });
  }));
  app.put("/api/profile", (request, response) => {
    if (!profile) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Research profile unavailable" } });
    const input = profileConfirmSchema.parse(request.body);
    const confirmed = profile.confirm(input.text, input.facets);
    return response.json({ data: profile.getActiveState() ?? { profile: confirmed, facets: [] } });
  });

  app.get("/api/radar/daily", asyncRoute(async (request, response) => {
    if (!radar) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Research radar unavailable" } });
    const { refresh } = radarQuerySchema.parse(request.query);
    return response.json({ data: await radar.getDailyView(refresh === "true") });
  }));
  app.get("/api/radar/topics", (_request, response) => {
    if (!profile || !topics) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Topic radar unavailable" } });
    const active = profile.getActive();
    if (!active) return response.status(409).json({ error: { code: "PROFILE_REQUIRED", message: "Research profile required" } });
    return response.json({ data: topics.buildTopics(active.version, new Date()) });
  });
  app.get("/api/radar/topics/:id", (request, response) => {
    if (!topics) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Topic radar unavailable" } });
    return response.json({ data: topics.getTopicDetail(String(request.params.id), Number(request.query.windowDays ?? 7)) });
  });
  app.post("/api/papers/:id/feedback", (request, response) => {
    if (!radar) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Research radar unavailable" } });
    return response.json({ data: radar.recordFeedback(String(request.params.id), paperFeedbackInputSchema.parse(request.body)) });
  });
  app.delete("/api/papers/:id/feedback", (request, response) => {
    if (!radar) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Research radar unavailable" } });
    const feedback = radar.undoFeedback(String(request.params.id));
    if (!feedback) return response.status(404).json({ error: { code: "NOT_FOUND", message: "Active feedback not found" } });
    return response.json({ data: feedback });
  });
  app.get("/api/ai/status", asyncRoute(async (_request, response) => {
    return response.json({ data: ai ? await ai.status() : { available: false, baseUrl: "", model: "", message: "AI not configured" } });
  }));

  app.get("/api/migration/export", (_request, response) => {
    if (!migration) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Migration unavailable" } });
    const archive = migration.exportArchive();
    response.setHeader("content-type", "application/zip");
    response.setHeader("content-disposition", "attachment; filename=research-update.zip");
    return response.send(Buffer.from(archive));
  });
  app.post("/api/migration/preview", upload.single("archive"), (request, response) => {
    if (!migration) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Migration unavailable" } });
    if (!request.file) return response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Archive is required" } });
    return response.json({ data: migration.previewArchive(request.file.buffer) });
  });
  app.post("/api/migration/restore", upload.single("archive"), (request, response) => {
    if (!migration) return response.status(503).json({ error: { code: "UNAVAILABLE", message: "Migration unavailable" } });
    if (!request.file) return response.status(400).json({ error: { code: "INVALID_REQUEST", message: "Archive is required" } });
    return response.json({ data: migration.restoreArchive(request.file.buffer) });
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
