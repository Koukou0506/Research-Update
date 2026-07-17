import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import express from "express";
import { createApp } from "./app";
import { Repository } from "./db/repository";
import { openDatabase } from "./db/schema";
import { RefreshService } from "./services/refresh";
import { SearchService } from "./services/search";
import { MigrationService } from "./services/migration";
import { RadarRepository } from "./db/radarRepository";
import { createOpenAiCompatibleProvider } from "./radar/ai/openaiCompatible";
import { ProfileService } from "./radar/profileService";
import { RadarService } from "./radar/radarService";
import { TopicService } from "./radar/topicService";
import { createAdsAdapter } from "./sources/ads";
import { createArxivAdapter } from "./sources/arxiv";
import { createFixtureAdapter } from "./sources/fixture";

try {
  process.loadEnvFile?.();
} catch {
  // A local .env file is optional.
}

const databasePath = resolve(process.env.DATABASE_PATH ?? "data/research-update.db");
mkdirSync(dirname(databasePath), { recursive: true });
const database = openDatabase(databasePath);
const repository = new Repository(database);
const radarRepository = new RadarRepository(database);
const fixtureMode = process.env.NODE_ENV === "test" && process.env.FIXTURE_MODE === "1";
const arxiv = fixtureMode ? createFixtureAdapter() : createArxivAdapter();
const ads = createAdsAdapter(process.env.ADS_API_TOKEN);
const adapters = ads ? [arxiv, ads] : [arxiv];
const aiBaseUrl = repository.getSetting("aiBaseUrl", process.env.AI_BASE_URL ?? "");
const aiModel = repository.getSetting("aiModel", process.env.AI_MODEL ?? "");
const ai = process.env.AI_API_KEY && aiBaseUrl && aiModel
  ? createOpenAiCompatibleProvider({ baseUrl: aiBaseUrl, model: aiModel, apiKey: process.env.AI_API_KEY })
  : undefined;
const profile = new ProfileService(radarRepository, ai);
const radar = new RadarService(repository, radarRepository, ai);
const topics = new TopicService(repository, radarRepository);
const app = createApp({
  repository,
  search: new SearchService(repository, adapters),
  refresh: new RefreshService(repository, adapters),
  migration: new MigrationService(repository),
  profile,
  radar,
  topics,
  ai,
  configuredSources: adapters.map((adapter) => adapter.source),
});
const port = Number(process.env.PORT ?? 4173);
const clientDirectory = resolve("dist/client");

app.use(express.static(clientDirectory));
app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
  response.sendFile(resolve(clientDirectory, "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Research Update is running at http://localhost:${port}`);
});
