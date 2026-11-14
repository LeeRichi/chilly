import "server-only";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Limits — conservative defaults, override in .env.local              */
/* ------------------------------------------------------------------ */

function num(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getLimits() {
  return {
    exaDailyUsd: num("BUTLER_EXA_DAILY_USD", 1),
    exaDailySearches: num("BUTLER_EXA_DAILY_SEARCHES", 60),
    geminiDailyCalls: num("BUTLER_GEMINI_DAILY_CALLS", 40),
    taskMaxSearches: num("BUTLER_TASK_MAX_SEARCHES", 5),
    taskMaxDrafts: num("BUTLER_TASK_MAX_DRAFTS", 4),
    /** Assumed cost of one search before Exa tells us the real number. */
    exaEstimateUsd: num("BUTLER_EXA_ESTIMATE_USD", 0.01),
    /** Conservative reservation for Deep Search before Exa returns its actual cost. */
    exaDeepEstimateUsd: num("BUTLER_EXA_DEEP_ESTIMATE_USD", 0.02),
    /** Background watches: how many may be active at once, and the minimum hours between checks. */
    maxActiveWatches: num("BUTLER_MAX_WATCHES", 3),
    watchEveryHours: Math.max(1, num("BUTLER_WATCH_EVERY_HOURS", 24)),
    /** Telegram reminders fire this many minutes before each step. */
    reminderLeadMinutes: num("BUTLER_REMINDER_LEAD_MIN", 10),
  };
}
export type Limits = ReturnType<typeof getLimits>;

/* ------------------------------------------------------------------ */
/* Ledger — persisted to .butler/usage.json so restarts don't reset it */
/* ------------------------------------------------------------------ */

type Day = {
  exaUsd: number;
  exaSearches: number;
  exaCacheHits: number;
  geminiCalls: number;
  geminiCacheHits: number;
  geminiInputTokens: number;
  geminiOutputTokens: number;
  telegramSent: number;
  watchRuns: number;
};
type Ledger = { days: Record<string, Day> };

const FILE = path.join(process.cwd(), ".butler", "usage.json");
const emptyDay = (): Day => ({ exaUsd: 0, exaSearches: 0, exaCacheHits: 0, geminiCalls: 0, geminiCacheHits: 0, geminiInputTokens: 0, geminiOutputTokens: 0, telegramSent: 0, watchRuns: 0 });

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki" }).format(new Date());

function load(): Ledger {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Ledger;
  } catch {
    return { days: {} };
  }
}

function update(fn: (day: Day) => void) {
  const ledger = load();
  const key = today();
  const day = { ...emptyDay(), ...ledger.days[key] };
  fn(day);
  ledger.days[key] = day;
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(`${FILE}.tmp`, JSON.stringify(ledger, null, 2));
  renameSync(`${FILE}.tmp`, FILE);
}

/* ------------------------------------------------------------------ */
/* Per-task counters (in memory; a task lives for one browser session) */
/* ------------------------------------------------------------------ */

type TaskCount = { searches: number; drafts: number; exaUsd: number; geminiTokens: number };
const g = globalThis as unknown as { __butlerTasks?: Map<string, TaskCount> };
const tasks = (g.__butlerTasks ??= new Map());
const taskCount = (taskId: string): TaskCount => {
  let t = tasks.get(taskId);
  if (!t) tasks.set(taskId, (t = { searches: 0, drafts: 0, exaUsd: 0, geminiTokens: 0 }));
  return t;
};

/* ------------------------------------------------------------------ */
/* Checks & records                                                    */
/* ------------------------------------------------------------------ */

export type UsageSnapshot = {
  date: string;
  limits: Limits;
  day: Day;
  task?: TaskCount;
};

export function snapshot(taskId?: string): UsageSnapshot {
  return {
    date: today(),
    limits: getLimits(),
    day: { ...emptyDay(), ...load().days[today()] },
    task: taskId ? { ...taskCount(taskId) } : undefined,
  };
}

/**
 * Checks the limits and, if allowed, reserves one search at the estimated cost,
 * so parallel searches can't overshoot. Returns a human-readable reason when blocked.
 * Call settleExa() with the real cost afterwards.
 */
export function reserveExa(taskId: string, opts: { background?: boolean; estimateUsd?: number } = {}): string | null {
  const limits = getLimits();
  const { day } = snapshot();
  const task = taskCount(taskId);
  const estimateUsd = Math.max(0, opts.estimateUsd ?? limits.exaEstimateUsd);
  // Background watches run once per cadence, so only the daily limits apply to them.
  if (!opts.background && task.searches >= limits.taskMaxSearches) return `This task already used its ${limits.taskMaxSearches} searches.`;
  if (day.exaSearches >= limits.exaDailySearches) return `Daily Exa search limit reached (${limits.exaDailySearches}).`;
  if (day.exaUsd + estimateUsd > limits.exaDailyUsd) return `Daily Exa budget reached ($${day.exaUsd.toFixed(3)} of $${limits.exaDailyUsd.toFixed(2)}).`;
  task.searches += 1;
  task.exaUsd += estimateUsd;
  update((d) => {
    d.exaSearches += 1;
    d.exaUsd += estimateUsd;
  });
  return null;
}

/** Replaces the reserved estimate with the real cost (0 if the search failed). */
export function settleExa(taskId: string, actualUsd: number | undefined, estimate = getLimits().exaEstimateUsd) {
  const delta = (actualUsd ?? estimate) - estimate;
  if (delta === 0) return;
  taskCount(taskId).exaUsd += delta;
  update((d) => void (d.exaUsd = Math.max(0, d.exaUsd + delta)));
}

export function recordExaCacheHit() {
  update((day) => void (day.exaCacheHits += 1));
}

export function checkGemini(taskId: string): string | null {
  const limits = getLimits();
  const { day } = snapshot();
  if (taskCount(taskId).drafts >= limits.taskMaxDrafts) return `This task already used its ${limits.taskMaxDrafts} AI drafts.`;
  if (day.geminiCalls >= limits.geminiDailyCalls) return `Daily Gemini limit reached (${limits.geminiDailyCalls} calls).`;
  return null;
}

/** Counts every request sent to Gemini, including retries and failures, since those use quota too. */
export function recordGemini(taskId: string, calls: number, inputTokens = 0, outputTokens = 0) {
  const task = taskCount(taskId);
  task.drafts += 1;
  task.geminiTokens += inputTokens + outputTokens;
  update((day) => {
    day.geminiCalls += calls;
    day.geminiInputTokens += inputTokens;
    day.geminiOutputTokens += outputTokens;
  });
}

export function recordGeminiCacheHit() {
  update((day) => void (day.geminiCacheHits += 1));
}

export function recordTelegram() {
  update((d) => void (d.telegramSent += 1));
}

export function recordWatchRun() {
  update((d) => void (d.watchRuns += 1));
}
