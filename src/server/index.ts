import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createApp } from "./app";
import { Repository } from "./db/repository";
import { openDatabase } from "./db/schema";
import { RefreshService } from "./services/refresh";
import { SearchService } from "./services/search";
import { MigrationService } from "./services/migration";
import { createAdsAdapter } from "./sources/ads";
import { createArxivAdapter } from "./sources/arxiv";

try {
  process.loadEnvFile?.();
} catch {
  // A local .env file is optional.
}

const databasePath = resolve(process.env.DATABASE_PATH ?? "data/research-update.db");
mkdirSync(dirname(databasePath), { recursive: true });
const repository = new Repository(openDatabase(databasePath));
const arxiv = createArxivAdapter();
const ads = createAdsAdapter(process.env.ADS_API_TOKEN);
const adapters = ads ? [arxiv, ads] : [arxiv];
const app = createApp({
  repository,
  search: new SearchService(repository, adapters),
  refresh: new RefreshService(repository, adapters),
  migration: new MigrationService(repository),
  configuredSources: adapters.map((adapter) => adapter.source),
});
const port = Number(process.env.PORT ?? 4173);

app.listen(port, "127.0.0.1", () => {
  console.log(`Research Update is running at http://localhost:${port}`);
});
