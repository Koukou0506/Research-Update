**Read this in other languages: [English](README.md), [中文](README_zh.md).**

# Research Update

Research Update is a personal, locally hosted research radar for following astronomy papers from arXiv and NASA ADS. It turns a confirmed research profile into a daily ranked reading list and an evidence-backed topic radar, while retaining the full searchable paper feed.

## Requirements

- Node.js 22 or newer
- An optional [NASA ADS API token](https://ui.adsabs.harvard.edu/help/api/)
- Optional credentials for an OpenAI-compatible analysis API

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

- On first use, describe your research direction, review the parsed topics, objects, methods, data types, authors, and exclusions, then confirm the profile.
- **Research radar** shows a stable daily selection and topic trends. Every recommendation exposes its score evidence; rule-only mode remains available when AI is not configured or fails.
- Mark recommendations as relevant or not relevant (with a reason) to influence later rankings without silently rewriting the current day's list.
- Enter a temporary query in the header and select ** Search**.
- Save a successful temporary query to add it to **Following**.
- Opening the page refreshes enabled saved searches; ** Refresh** runs it manually.
- Filter the feed by saved search, source, read/favorite state, and sort order.
- Paper titles and abstracts remain in their source language; application controls switch between Chinese and English.

The first request retrieves up to 50 newest results per available source. Later refreshes use each source's last successful timestamp with a 24-hour overlap, then deduplicate the overlap.

## Optional AI analysis

Configure any OpenAI-compatible endpoint in `.env`:

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=your-model
AI_API_KEY=your-secret-key
```

The API key stays in the server environment and is never stored in SQLite, returned to the browser, or included in exports. Without all three values, the radar uses deterministic explainable rules. A provider failure also falls back to rule-only ranking.

## Backup and migration

Open **Data migration** and select ** Export ZIP**. The v2 archive contains saved searches, settings, cached paper metadata, user state, research profiles, topic evidence, scores, feedback, and daily selections. Existing v1 archives remain importable.

On a new device, install Research Update, open the migration panel, choose the ZIP, review its counts, and confirm restore. Restore is transactional: an invalid or incompatible archive leaves the current database unchanged. ADS tokens are deliberately excluded and must be configured separately on the new device.

## Local data

The default database is `RFU/data/research-update.db`. Set `DATABASE_PATH` to use another location. Database files, `.env`, logs, build output, and dependencies are ignored by Git.

Research Update is local-only: it has no accounts, cloud synchronization, notifications while closed, machine translation, or PDF storage.

## Verification

```powershell
npm test
npm run build
npm run test:e2e
```

Automated tests use fixed arXiv/ADS fixtures and do not depend on live third-party availability.
