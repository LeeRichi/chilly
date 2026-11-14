# Chilly

Chilly is a research-backed personal assistant for live tasks. It searches the web with Exa, uses
Gemini to turn current evidence into an actionable plan, and shows the sources behind its
recommendations.

## What Chilly does

- Runs an Exa-researched task and a direct Gemini answer side by side from the same prompt. The
  Gemini baseline does not search the web; Chilly uses Exa evidence before drafting its plan.
- Shows sources, findings, options, recommendations, and next steps in a reviewable result.
- Lets the user approve a plan before saving it to PostgreSQL or carrying out selected actions.
- Tracks task progress, watches for relevant changes, and can send approved reminders through
  Telegram.
- Creates calendar files for dated plan steps. Prepared email messages open in the user's mail app
  for review; Chilly does not send email automatically.

## Quick start

1. Copy `.env.example` to `.env.local` and add the required credentials.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

### Required configuration

| Variable         | Used for                                           |
| ---------------- | -------------------------------------------------- |
| `GEMINI_API_KEY` | Direct baseline answers and Chilly plan generation |
| `EXA_API_KEY`    | Web research and background watches                |
| `DATABASE_URL`   | Saving approved tasks and tracking their progress  |

Database tables are created when first needed. Generating a plan does not save it; the user must
approve it first.

Telegram is optional. Add a bot token, send the bot `/start`, then use **Connect** in the sidebar.
The app fills in the chat ID during connection.

## Demo flow

1. Enter a task or choose a starter prompt. The direct Gemini answer and Chilly's research begin in
   parallel.
2. Review the research timeline and the side-by-side answers. Chilly's column includes its Exa
   sources; Gemini's column is labeled as a direct answer without web search.
3. Review Chilly's plan and approve it. Choose any calendar, reminder, or watch actions offered for
   the task.
4. Follow progress from the saved task. Real watches use Exa; demo watches are labeled and use
   simulated updates.

Try a live query such as:

> My rent in Helsinki is going up by 15%. Is that allowed, and what should I check before replying
> to my landlord?

Other useful prompts:

- “I’m an international student in Finland and I’m struggling with monthly expenses. What support
  might I qualify for, and how do I apply?”
- “My flight from Helsinki was cancelled and I need to get to Stockholm tomorrow. Find my options
  and help me decide what to do next.”
- “Plan a birthday dinner in Helsinki for six people next Saturday, under €40 per person. One guest
  is vegetarian.”
- “Help me plan a special occasion next month.” Chilly should ask for details that affect the plan
  before researching options.

## How search depth is chosen

Chilly uses the deterministic rule in [`src/lib/research-mode.ts`](src/lib/research-mode.ts); it does
not make a model call just to classify the prompt.

- **Deep** is selected whenever a research request contains more than one query, including follow-up
  searches that split a task into multiple questions.
- **Deep** is selected for legal, rights, regulation, eligibility, benefit, allowance, subsidy, grant,
  visa, residence permit, tenant, landlord, rent, tax, insurance, comparison, versus, best, cheapest,
  or options terms. The matcher includes common Chinese terms such as `福利`, `資格`, `租屋`, `法律`,
  and `比較`.
- **Deep** is selected for multi-stop plans that mention a plan, schedule, or itinerary together
  with a day, trip, flight, or similar travel term; for a fixed time or deadline with at least one
  condition; or when at least two condition markers appear, such as `and`, `before`, `under`, `then`,
  or a comma.
- Prompts longer than 180 characters with at least one condition marker also use **Deep**.
- All other requests use **Auto**.

Deep searches request structured findings and caveats from Exa. Chilly attaches Exa's field-level
citations to the corresponding evidence before Gemini drafts the plan. The selected depth appears in
the research timeline. Normal searches may reuse identical results for up to six hours and request
page content no older than `BUTLER_EXA_MAX_AGE_HOURS` (24 hours by default).

## Approval and data flow

`Research → Draft → Review → Approve → Save / Act`

Search and drafting are read-only. Chilly validates the plan again on the server when it is approved.
Only then can it save the task and carry out the actions selected by the user. Calendar steps are
downloaded as an `.ics` file; Telegram reminders and watches require an active connection and the
user's approval.

## Limits and optional settings

Defaults are listed in `.env.example`. They can be overridden in the server environment.

| Variable                       |                                       Default | Purpose                                           |
| ------------------------------ | --------------------------------------------: | ------------------------------------------------- |
| `GEMINI_MODELS`                | `gemini-3.5-flash-lite,gemini-3.1-flash-lite` | Gemini model fallback order                       |
| `BUTLER_GEMINI_DAILY_CALLS`    |                                         `120` | Daily Gemini request limit, including comparisons |
| `BUTLER_EXA_DAILY_USD`         |                                           `1` | Daily Exa spend limit                             |
| `BUTLER_EXA_DAILY_SEARCHES`    |                                          `60` | Daily Exa search limit                            |
| `BUTLER_TASK_MAX_SEARCHES`     |                                           `5` | Search limit per task                             |
| `BUTLER_TASK_MAX_DRAFTS`       |                                           `4` | Structured draft limit per task                   |
| `BUTLER_EXA_ESTIMATE_USD`      |                                        `0.01` | Reserved cost per standard search                 |
| `BUTLER_EXA_DEEP_ESTIMATE_USD` |                                        `0.02` | Reserved cost per Deep search                     |
| `BUTLER_EXA_MAX_AGE_HOURS`     |                                          `24` | Maximum page age requested for normal searches    |
| `BUTLER_MAX_WATCHES`           |                                           `3` | Maximum active watches                            |
| `BUTLER_WATCH_EVERY_HOURS`     |                                          `24` | Default watch interval                            |
| `BUTLER_REMINDER_LEAD_MIN`     |                                          `10` | Default reminder lead time                        |

The direct Gemini comparison uses the configured Gemini model fallback list and counts against the
daily Gemini request limit. Exa cost estimates reserve budget before a search; the ledger is updated
to the reported cost when Exa returns it.

## Development

```bash
npm run dev          # Start the local app
npm run lint         # Run ESLint
npm run format       # Format app source and README
npm run format:check # Check formatting without changing files
npm run build        # Build for deployment
```
