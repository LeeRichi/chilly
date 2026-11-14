# Chilly

A research-backed strategy desk for Junction 2026. The app searches with Exa, creates a validated blueprint with Gemini, and stores it in PostgreSQL only after a person approves it.

## Getting started

1. Copy `.env.example` to `.env.local` and add your Gemini, Exa, and Aiven PostgreSQL credentials.
2. Install packages with `npm install`.
3. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Draft generation needs `GEMINI_API_KEY` and `EXA_API_KEY`. Saving needs `DATABASE_URL`. The `blueprints` table is created on the first approved save; merely generating a draft does not write to the database.

## Try these prompts

These examples cover a range of everyday tasks from the Junction challenge:

1. **Rent and rights:** “My rent in Helsinki is going up by 15%. Is that allowed, and what should I check before replying to my landlord?”
2. **Potentially missed benefits:** “I’m an international student in Finland and I’m struggling with monthly expenses. What benefits or support might I qualify for, and how do I apply?”
3. **Travel disruption:** “My flight from Helsinki was cancelled and I need to get to Stockholm tomorrow. Find my options and help me figure out what to do next.”
4. **Special occasion:** “Plan a birthday dinner in Helsinki for six people next Saturday, under €40 per person. One guest is vegetarian.”
5. **Daily errand:** “I need to renew my passport while living in Helsinki. Find the steps, documents, costs, and earliest practical time to get it done.”

To see how Chilly handles a vague request, try: “Help me plan a special occasion next month.” It should ask for details that affect the plan before researching options.

Prepared messages open in your email app for you to review and send. Chilly does not send email automatically.

## Search depth selection

Chilly selects Exa search depth with a shared, deterministic rule in `src/lib/research-mode.ts`; it does not make an extra model call just to classify a prompt.

- **Deep** is selected whenever a research request contains more than one query. This covers follow-up searches that split a task into multiple questions.
- **Deep** is also selected when a query includes legal, rights, regulation, eligibility, benefit, allowance, subsidy, grant, visa, residence permit, tenant, landlord, rent, tax, insurance, comparison, versus, best, cheapest, or options terms. The matcher includes English and common Chinese terms such as `福利`, `資格`, `租屋`, `法律`, and `比較`.
- **Deep** is selected for multi-stop plans mentioning a plan/schedule/itinerary and a day, trip, flight, or similar travel term; for a fixed time or deadline combined with at least one condition; or when at least two condition markers appear (for example `and`, `before`, `under`, `then`, or a comma).
- A prompt longer than 180 characters with at least one condition marker also uses **Deep**.
- All other requests use **Auto**.

Deep searches request structured findings and caveats from Exa. Chilly attaches Exa's field-level citations to the corresponding source evidence before Gemini drafts the final plan. Search depth is visible in the research timeline. Deep requests reserve `$0.02` against the Exa budget before the call; the ledger is adjusted to Exa's reported cost after it returns.

## Safety flow

`DRAFTING` → `PENDING_APPROVAL` → `SAVED`

Search and generation are read-only. The browser holds the pending blueprint. The save server action validates it again before inserting it into PostgreSQL.
