# Chilly

Chilly is a research-backed personal assistant for live tasks. It searches the web with Exa, uses
Gemini to turn current evidence into an actionable plan, and shows the sources behind its
recommendations.

## What Chilly does

- Checks whether the task has enough user-specific context, then runs an Exa-researched task and a
  direct Gemini answer side by side. The Gemini baseline does not search the web; Chilly uses Exa
  evidence before drafting its plan.
- Shows sources, findings, options, recommendations, and next steps in a reviewable result.
- Runs a Strategist and a Challenger independently in parallel on the same Exa evidence, then has a
  Judge resolve disagreements into one plan. Tasks that still need clarification are clarified
  first.
- Lets the user approve a plan before saving it in the current browser or carrying out selected actions.
- Tracks task progress, watches for relevant changes, and can send approved reminders through
  Telegram.
- Creates calendar files for dated plan steps. Prepared email messages open in the user's mail app
  for review; Chilly does not send email automatically.

## Quick start

1. Copy `.env.example` to `.env.local` and add the required credentials.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev` and open [http://localhost:3000](http://localhost:3000).

### Configuration

| Variable         | Used for                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Intake checks, direct baseline answers, and Chilly plan generation         |
| `EXA_API_KEY`    | Web research and background watches                                        |
| `DATABASE_URL`   | Optional; required for background watches, reminders, and activity records |

Database tables are created when first needed. Approving a plan stores it in this browser; Aiven is
used only when an approved action needs background processing.

Trying Chilly and saving tasks do not require an account. The Saved tasks list and checklist
progress stay in the current browser and are not synced to other devices. When a user enables a
background watch, reminder, or Telegram action, the server keeps the task snapshot and activity in
Aiven PostgreSQL, keyed to a random device ID stored in that browser. Telegram is optional; each
browser connects its own chat from the sidebar. Clearing browser data removes access to its local
list and background settings.

## Demo flow

1. Enter a task or choose a starter prompt. Chilly checks for missing details that could change the
   result. If it needs user-specific context, it asks before searching.
2. Once there is enough context, the direct Gemini answer and Chilly's Exa research begin in
   parallel.
3. Review the research timeline and the side-by-side answers. Chilly's column includes its Exa
   sources; Gemini's column is labeled as a direct answer without web search.
4. Review Chilly's plan and approve it. Choose any calendar, reminder, or watch actions offered for
   the task.
5. Follow progress from the saved task. Real watches use Exa; demo watches are labeled and use
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

## Context sufficiency and clarification

Before the first Exa search, Gemini runs a structured intake assessment. It decides whether Chilly
has enough context to make a useful first result, and returns one of three outcomes: proceed, ask
focused questions, or proceed with explicit assumptions. The same policy applies across task types;
it is not a fixed list of prompts or required fields.

1. **Ask the user** when missing, user-specific information could materially change the result.
2. **Research with Exa** when the missing information is public and can be found online.
3. **State an assumption** when the missing detail has low impact and a useful result is still
   possible.

Chilly asks up to three focused questions per turn and allows at most two clarification rounds. At
the limit, it proceeds and asks Gemini to disclose remaining assumptions in the plan. User answers
are included in subsequent Exa queries. Imported content is available to the intake and plan stages
as reference data. Intake assumptions are also passed to the plan so they can be identified rather
than stated as confirmed facts.

For example, a local weather task needs a location before Chilly searches or sets up a watch. For a
benefits task, Chilly can ask for personal eligibility context while using Exa to research current
rules and application steps.

### One product differentiator

Clarifying questions alone are common. One of Chilly's differentiators is deciding what to ask the
user, what to find with Exa, and what can safely be assumed before research starts. Once the task is
ready, both answers use the clarified task. The direct Gemini baseline answers without web search;
Chilly adds Exa research and visible citations. This makes the effect of current evidence easy to
compare. The demo should show the full loop: clarify a decision-critical detail, research current
sources, present a plan, and let the user approve actions. This is one part of Chilly's product
design, not a claim that intake alone guarantees a better answer.

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
downloaded as an `.ics` file. Watches and reminders require the user's approval; Telegram alerts
require an active connection. Selecting a watch opts into Telegram alerts for new updates when
Telegram is connected. The separate Telegram option sends only the one-time plan summary.

## Limits and optional settings

Defaults are listed in `.env.example`. They can be overridden in the server environment.

| Variable                       |                                       Default | Purpose                                            |
| ------------------------------ | --------------------------------------------: | -------------------------------------------------- |
| `GEMINI_MODELS`                | `gemini-3.5-flash-lite,gemini-3.1-flash-lite` | Gemini model fallback order                        |
| `BUTLER_GEMINI_DAILY_CALLS`    |                                         `120` | Daily limit for intake, comparison, and plan calls |
| `BUTLER_EXA_DAILY_USD`         |                                           `1` | Daily Exa spend limit                              |
| `BUTLER_EXA_DAILY_SEARCHES`    |                                          `60` | Daily Exa search limit                             |
| `BUTLER_TASK_MAX_SEARCHES`     |                                           `5` | Search limit per task                              |
| `BUTLER_TASK_MAX_DRAFTS`       |                                           `4` | Structured draft limit per task                    |
| `BUTLER_EXA_ESTIMATE_USD`      |                                        `0.01` | Reserved cost per standard search                  |
| `BUTLER_EXA_DEEP_ESTIMATE_USD` |                                        `0.02` | Reserved cost per Deep search                      |
| `BUTLER_EXA_MAX_AGE_HOURS`     |                                          `24` | Maximum page age requested for normal searches     |
| `BUTLER_MAX_WATCHES`           |                                           `3` | Maximum active watches                             |
| `BUTLER_WATCH_EVERY_HOURS`     |                                          `24` | Default watch interval                             |
| `BUTLER_REMINDER_LEAD_MIN`     |                                          `10` | Default reminder lead time                         |

Intake checks, direct Gemini comparisons, and plan drafting use the configured Gemini model fallback
list and count against the daily Gemini request limit. Exa cost estimates reserve budget before a
search; the ledger is updated to the reported cost when Exa returns it.

## Development

```bash
npm run dev          # Start the local app
npm run lint         # Run ESLint
npm run format       # Format app source and README
npm run format:check # Check formatting without changing files
npm run build        # Build for deployment
```
