# How to Win Junction

A research-backed strategy desk for Junction 2026. The app searches with Exa, creates a validated blueprint with Gemini, and stores it in PostgreSQL only after a person approves it.

## Getting started

1. Copy `.env.example` to `.env.local` and add your Gemini, Exa, and Aiven PostgreSQL credentials.
2. Install packages with `npm install`.
3. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Draft generation needs `GEMINI_API_KEY` and `EXA_API_KEY`. Saving needs `DATABASE_URL`. The `blueprints` table is created on the first approved save; merely generating a draft does not write to the database.

## Safety flow

`DRAFTING` → `PENDING_APPROVAL` → `SAVED`

Search and generation are read-only. The browser holds the pending blueprint. The save server action validates it again before inserting it into PostgreSQL.
