# Research Update

Research Update is a personal, locally hosted dashboard for following astronomy papers from arXiv and NASA ADS. It keeps saved keyword searches, cached paper metadata, favorites, read state, and refresh history in a local SQLite database.

## Requirements

- Node.js 22 or newer
- An optional [NASA ADS API token](https://ui.adsabs.harvard.edu/help/api/)

arXiv works without an account or token. ADS features remain disabled until a token is configured.

## Install and run

```powershell
cd RFU
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. Development mode runs Vite on port 5173 and the local API on port 4173.

To run the built single-process version:

```powershell
npm run build
npm start
```

Open `http://localhost:4173`.

## ADS configuration

Add the token to `.env`:

```dotenv
ADS_API_TOKEN=your_token_here
PORT=4173
```

The token is read only by the local server. It is not returned to the browser, written to SQLite, logged, or included in migration archives. Restart the server after changing `.env`.

## Using the dashboard

- Enter a temporary query in the header and select **搜索 / Search**.
- Save a successful temporary query to add it to **关注词 / Following**.
- Opening the page refreshes enabled saved searches; **更新 / Refresh** runs it manually.
- Filter the feed by saved search, source, read/favorite state, and sort order.
- Paper titles and abstracts remain in their source language; application controls switch between Chinese and English.

The first request retrieves up to 50 newest results per available source. Later refreshes use each source's last successful timestamp with a 24-hour overlap, then deduplicate the overlap.

## Backup and migration

Open **数据迁移 / Data migration** and select **导出 ZIP / Export ZIP**. The archive contains saved searches, settings, all cached paper metadata, source identifiers, favorites, read state, and refresh history.

On a new device, install Research Update, open the migration panel, choose the ZIP, review its counts, and confirm restore. Restore is transactional: an invalid or incompatible archive leaves the current database unchanged. ADS tokens are deliberately excluded and must be configured separately on the new device.

## Local data

The default database is `RFU/data/research-update.db`. Set `DATABASE_PATH` to use another location. Database files, `.env`, logs, build output, and dependencies are ignored by Git.

Research Update is local-only: it has no accounts, cloud synchronization, notifications while closed, machine translation, AI summaries, or PDF storage.

## Verification

```powershell
npm test
npm run build
npm run test:e2e
```

Automated tests use fixed arXiv/ADS fixtures and do not depend on live third-party availability.
