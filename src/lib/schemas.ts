import { z } from "zod";

export const taskInputSchema = z.object({ prompt: z.string().trim().min(8).max(1200) });

/* ------------------------------------------------------------------ */
/* Gemini output schema                                                */
/* Flat on purpose: Gemini structured output is most reliable without  */
/* unions. Sources are cited by evidence number ([1], [2], …) rather   */
/* than by URL, so the server can verify every citation.               */
/* ------------------------------------------------------------------ */

const cite = z.array(z.number().int()).describe("Evidence numbers that support this, e.g. [1, 3]");

export const geminiOutputSchema = z.object({
  kind: z.enum(["clarify", "result"]).describe("clarify = must ask the user before acting; result = enough to act"),
  shouldOfferLiveUpdates: z.boolean().describe("True only when the user would benefit from optionally tracking future changes after this plan, such as prices, news, availability, or disruptions. This only controls whether the result offers background update settings; it does not trigger another immediate search."),
  liveUpdateReason: z.string().describe("Short reason for the optional background update choice. Empty when shouldOfferLiveUpdates is false."),
  understanding: z.string().describe("One sentence: what the user wants, as understood so far"),
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.object({
      label: z.string(),
      source: z.number().int().optional().describe("Evidence number if this option came from the web"),
    })).max(8),
    allowFreeText: z.boolean(),
  })).max(3).describe("Only for kind=clarify. Empty for kind=result."),
  title: z.string().describe("Only for kind=result. Short task title."),
  summary: z.string().describe("Only for kind=result. 2-4 sentence answer."),
  findings: z.array(z.object({ claim: z.string(), sources: cite })),
  options: z.array(z.object({
    name: z.string(),
    details: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    sources: cite,
  })).describe("Compared alternatives (benefits, flights, routes, challenges…). Empty if not relevant."),
  timeline: z.array(z.object({
    time: z.string().describe('Clock time like "15:00" or relative like "T-2h"'),
    action: z.string(),
    note: z.string(),
    isEstimate: z.boolean().describe("true if the time is estimated rather than given by the user or a source"),
    datetime: z.string().describe('Local date and time "YYYY-MM-DDTHH:MM" (Europe/Helsinki) when the calendar date is known; empty otherwise. Never guess the date.'),
    sources: cite,
  })).describe("Step-by-step schedule when timing matters. Empty otherwise."),
  recommendation: z.string(),
  nextActions: z.array(z.object({
    type: z.enum(["open_link", "checklist", "draft_message", "reminder"]),
    label: z.string(),
    content: z.string().describe("Checklist items (one per line) or the drafted message text. Empty for open_link."),
    url: z.string().describe("For open_link: a URL taken from the evidence. Empty otherwise."),
    recipient: z.string().describe("For draft_message: an email address that appears verbatim in the evidence or the user's text. Empty if none. Never invent one."),
    subject: z.string().describe("For draft_message: a short email subject. Empty otherwise."),
    datetime: z.string().describe('For reminder: local "YYYY-MM-DDTHH:MM" (Europe/Helsinki) if the date is known. Empty otherwise.'),
  })),
  caveats: z.array(z.string()).describe("Assumptions, missing info, things to double-check"),
  keyChecks: z.array(z.string()).max(3).describe("The 1-3 most important things the user must confirm before approving (risky assumptions, hard deadlines, open questions). One short sentence each. Shown above the approve button."),
  watches: z.array(z.object({
    query: z.string().describe("A precise web search to re-run periodically to catch new or changed information for this task"),
    reason: z.string().describe("Short label of what is being watched, e.g. 'Finnair strike news'"),
    everyHours: z.number().int().describe("Choose 1 for fast-moving news or active situations where an hourly check matters; choose 24 for slower changes. Do not create a watch for evergreen topics."),
    until: z.string().describe('"YYYY-MM-DD" after which watching is pointless (e.g. the event date). Empty if unknown.'),
  })).max(2).describe("Optional background Exa watches. Include at least one precise query when shouldOfferLiveUpdates=true; leave empty when false."),
  followUpQueries: z.array(z.string()).max(3).describe("Extra web searches that would materially improve the answer. Empty if not needed."),
});

export type GeminiOutput = z.infer<typeof geminiOutputSchema>;

/* ------------------------------------------------------------------ */
/* Validated, client-facing shapes                                      */
/* ------------------------------------------------------------------ */

export const sourceRefSchema = z.object({ n: z.number().int(), title: z.string(), url: z.string().url() });
export type SourceRef = z.infer<typeof sourceRefSchema>;

const cited = z.array(z.number().int());

export const taskResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.object({ claim: z.string(), sources: cited })),
  options: z.array(z.object({ name: z.string(), details: z.string(), pros: z.array(z.string()), cons: z.array(z.string()), sources: cited })),
  // New fields default to "" so tasks saved before they existed still load.
  timeline: z.array(z.object({ time: z.string(), action: z.string(), note: z.string(), isEstimate: z.boolean(), datetime: z.string().default(""), sources: cited })),
  recommendation: z.string(),
  nextActions: z.array(z.object({
    type: z.enum(["open_link", "checklist", "draft_message", "reminder"]),
    label: z.string(),
    content: z.string(),
    url: z.string(),
    recipient: z.string().default(""),
    subject: z.string().default(""),
    datetime: z.string().default(""),
  })),
  caveats: z.array(z.string()),
  keyChecks: z.array(z.string()).default([]),
  watches: z.array(z.object({ query: z.string(), reason: z.string(), everyHours: z.number().int().default(24), until: z.string() })).default([]),
  agentConversation: z.array(z.object({ role: z.enum(["strategist", "challenger"]), message: z.string() })).default([]),
  freshness: z.object({
    status: z.enum(["checked", "failed"]),
    reason: z.string(),
    checkedAt: z.string().optional(),
  }).optional(),
});
export type TaskResult = z.infer<typeof taskResultSchema>;

/** What the user ticked on the approval card. Indexes point into result.nextActions / result.watches. */
export const approvalSchema = z.object({
  watches: z.array(z.number().int().min(0).max(5)).max(5),
  /** User-selected interval between Exa checks, keyed by watch index. */
  watchIntervals: z.record(z.string().regex(/^\d{1,2}$/), z.number().int().refine((n) => [2, 60, 180, 360, 1440].includes(n))).default({}),
  /** Demo mode triggers one clearly labeled simulated news update instead of calling Exa. */
  watchModes: z.record(z.string().regex(/^\d{1,2}$/), z.enum(["real", "demo"])).default({}),
  telegram: z.boolean(),
  /** Telegram reminders before each dated timeline step / reminder action. */
  reminders: z.boolean().default(false),
});
export type Approval = z.input<typeof approvalSchema>;

/** Checklist progress, keyed "actionIndex:itemIndex". */
export const progressSchema = z.record(z.string().regex(/^\d{1,2}:\d{1,3}$/), z.boolean())
  .refine((p) => Object.keys(p).length <= 500, "Too many checklist items");
export type Progress = z.infer<typeof progressSchema>;

export const clarificationSchema = z.object({ question: z.string().max(500), answer: z.string().max(1000) });
export type Clarification = z.infer<typeof clarificationSchema>;

/** Data the user chose to send from a logged-in page via the bookmarklet. Untrusted. */
export const pageImportSchema = z.object({
  type: z.literal("butler-import"),
  url: z.string().max(2000),
  title: z.string().max(300),
  items: z.array(z.object({ text: z.string().max(500), href: z.string().max(2000) })).max(80),
});
export type PageImport = z.infer<typeof pageImportSchema>;

export const savedTaskSchema = z.object({
  prompt: z.string().min(1).max(1200),
  clarifications: z.array(clarificationSchema).max(10),
  result: taskResultSchema,
  sources: z.array(sourceRefSchema).max(40),
  progress: progressSchema.default({}),
});
export type SavedTask = z.input<typeof savedTaskSchema>;
