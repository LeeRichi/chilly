import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type ActionKind = "email" | "watch" | "telegram" | "calendar" | "save";
export type ActionStatus = "done" | "failed" | "skipped";

export type ActionLog = { id: string; taskId: string; kind: ActionKind; label: string; status: ActionStatus; detail: Record<string, unknown>; createdAt: string };

export type Watch = {
  id: string;
  taskId: string;
  query: string;
  reason: string;
  everyMinutes: number;
  demoMode: boolean;
  until: string;
  notifyTelegram: boolean;
  active: boolean;
  runs: number;
  lastCheckedAt: string;
  nextRunAt: string;
  createdAt: string;
};

export type WatchHit = { title: string; url: string; snippet: string; publishedDate?: string; demo?: boolean };
export type WatchRun = { id: string; watchId: string; ranAt: string; hits: WatchHit[]; costUsd: number | null; error: string | null };

/* ------------------------------------------------------------------ */
/* Schema                                                               */
/* ------------------------------------------------------------------ */

let ready: Promise<void> | undefined;
function ensureTables() {
  ready ??= (async () => {
    const sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS task_actions (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, kind text NOT NULL, label text NOT NULL,
      status text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS watches (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, query text NOT NULL, reason text NOT NULL,
      every_hours int NOT NULL DEFAULT 24, every_minutes int NOT NULL DEFAULT 1440,
      until timestamptz NOT NULL, notify_telegram boolean NOT NULL DEFAULT false,
      active boolean NOT NULL DEFAULT true, demo_mode boolean NOT NULL DEFAULT false,
      runs int NOT NULL DEFAULT 0, seen_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_checked_at timestamptz NOT NULL, next_run_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`ALTER TABLE watches ADD COLUMN IF NOT EXISTS every_minutes int NOT NULL DEFAULT 1440`;
    await sql`ALTER TABLE watches ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false`;
    await sql`ALTER TABLE watches ALTER COLUMN every_hours SET DEFAULT 24`;
    await sql`UPDATE watches SET every_minutes = every_hours * 60 WHERE every_minutes = 1440 AND every_hours <> 24`;
    await sql`CREATE TABLE IF NOT EXISTS watch_runs (
      id uuid PRIMARY KEY, watch_id uuid NOT NULL, ran_at timestamptz NOT NULL DEFAULT now(),
      hits jsonb NOT NULL DEFAULT '[]'::jsonb, cost_usd double precision, error text
    )`;
    await sql`CREATE TABLE IF NOT EXISTS reminders (
      id uuid PRIMARY KEY, task_id uuid NOT NULL, send_at timestamptz NOT NULL, step_at timestamptz NOT NULL,
      text text NOT NULL, status text NOT NULL DEFAULT 'pending', error text, sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

const iso = (v: unknown) => new Date(v as string).toISOString();

/* ------------------------------------------------------------------ */
/* Activity log                                                         */
/* ------------------------------------------------------------------ */

export async function logAction(taskId: string, kind: ActionKind, label: string, status: ActionStatus, detail: Record<string, unknown> = {}) {
  await ensureTables();
  const id = randomUUID();
  await getDb()`INSERT INTO task_actions (id, task_id, kind, label, status, detail) VALUES (${id}, ${taskId}, ${kind}, ${label}, ${status}, ${getDb().json(detail as never)})`;
  return id;
}

export async function listActions(taskId: string): Promise<ActionLog[]> {
  await ensureTables();
  const rows = await getDb()`SELECT * FROM task_actions WHERE task_id = ${taskId} ORDER BY created_at ASC`;
  return rows.map((r) => ({ id: r.id, taskId: r.task_id, kind: r.kind, label: r.label, status: r.status, detail: r.detail, createdAt: iso(r.created_at) }));
}

/* ------------------------------------------------------------------ */
/* Watches                                                              */
/* ------------------------------------------------------------------ */

function toWatch(r: Record<string, unknown>): Watch {
  return {
    id: r.id as string, taskId: r.task_id as string, query: r.query as string, reason: r.reason as string,
    everyMinutes: r.every_minutes as number, demoMode: r.demo_mode as boolean, until: iso(r.until), notifyTelegram: r.notify_telegram as boolean,
    active: r.active as boolean, runs: r.runs as number, lastCheckedAt: iso(r.last_checked_at),
    nextRunAt: iso(r.next_run_at), createdAt: iso(r.created_at),
  };
}

export async function countActiveWatches() {
  await ensureTables();
  const [row] = await getDb()`SELECT count(*)::int AS n FROM watches WHERE active AND until > now()`;
  return row.n as number;
}

export async function createWatch(input: { taskId: string; query: string; reason: string; everyMinutes: number; demoMode?: boolean; until: Date; notifyTelegram: boolean; seenUrls: string[] }) {
  await ensureTables();
  const id = randomUUID();
  const now = new Date();
  const next = new Date(now.getTime() + (input.demoMode ? 30_000 : input.everyMinutes * 60_000));
  const legacyHours = Math.max(1, Math.ceil(input.everyMinutes / 60));
  await getDb()`
    INSERT INTO watches (id, task_id, query, reason, every_hours, every_minutes, demo_mode, until, notify_telegram, seen_urls, last_checked_at, next_run_at)
    VALUES (${id}, ${input.taskId}, ${input.query}, ${input.reason}, ${legacyHours}, ${input.everyMinutes}, ${input.demoMode ?? false}, ${input.until}, ${input.notifyTelegram},
            ${getDb().json(input.seenUrls)}, ${now}, ${next})
  `;
  return id;
}

export async function listWatches(taskId: string): Promise<Watch[]> {
  await ensureTables();
  const rows = await getDb()`SELECT * FROM watches WHERE task_id = ${taskId} ORDER BY created_at ASC`;
  return rows.map(toWatch);
}

export async function getWatchWithSeen(id: string): Promise<(Watch & { seenUrls: string[] }) | null> {
  await ensureTables();
  const [row] = await getDb()`SELECT * FROM watches WHERE id = ${id}`;
  return row ? { ...toWatch(row), seenUrls: (row.seen_urls as string[]) ?? [] } : null;
}

/** Watches whose next check is due and that haven't expired. */
export async function dueWatchIds(limit = 5): Promise<string[]> {
  await ensureTables();
  const rows = await getDb()`SELECT id FROM watches WHERE active AND until > now() AND next_run_at <= now() ORDER BY next_run_at ASC LIMIT ${limit}`;
  return rows.map((r) => r.id as string);
}

export async function recordWatchRunRow(watch: Watch, hits: WatchHit[], seenUrls: string[], costUsd: number | null, error: string | null, stopAfterRun = false) {
  await ensureTables();
  const sql = getDb();
  const now = new Date();
  const next = new Date(now.getTime() + watch.everyMinutes * 60_000);
  await sql`INSERT INTO watch_runs (id, watch_id, hits, cost_usd, error) VALUES (${randomUUID()}, ${watch.id}, ${sql.json(hits)}, ${costUsd}, ${error})`;
  // On error, keep last_checked_at so the next run still covers the gap.
  await sql`
    UPDATE watches SET runs = runs + 1, seen_urls = ${sql.json(seenUrls)}, next_run_at = ${next}, active = CASE WHEN ${stopAfterRun} THEN false ELSE active END,
      last_checked_at = ${error ? sql`last_checked_at` : now}
    WHERE id = ${watch.id}
  `;
}

/** Atomically claims a one-shot demo watch so overlapping scheduler ticks cannot duplicate it. */
export async function claimDemoWatch(id: string) {
  await ensureTables();
  const rows = await getDb()`UPDATE watches SET active = false WHERE id = ${id} AND active AND demo_mode RETURNING id`;
  return rows.length > 0;
}

export async function setWatchActive(id: string, active: boolean) {
  await ensureTables();
  const rows = await getDb()`UPDATE watches SET active = ${active} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Deletes a saved task and all of its background activity in one transaction. */
export async function deleteTaskAndActivity(taskId: string) {
  await ensureTables();
  const sql = getDb();
  return sql.begin(async (tx) => {
    await tx`DELETE FROM watch_runs WHERE watch_id IN (SELECT id FROM watches WHERE task_id = ${taskId})`;
    await tx`DELETE FROM watches WHERE task_id = ${taskId}`;
    await tx`DELETE FROM reminders WHERE task_id = ${taskId}`;
    await tx`DELETE FROM task_actions WHERE task_id = ${taskId}`;
    const rows = await tx`DELETE FROM tasks WHERE id = ${taskId} RETURNING id`;
    return rows.length > 0;
  });
}

export async function listWatchRuns(watchIds: string[]): Promise<WatchRun[]> {
  if (watchIds.length === 0) return [];
  await ensureTables();
  const rows = await getDb()`SELECT * FROM watch_runs WHERE watch_id IN ${getDb()(watchIds)} ORDER BY ran_at DESC LIMIT 50`;
  return rows.map((r) => ({ id: r.id, watchId: r.watch_id, ranAt: iso(r.ran_at), hits: r.hits as WatchHit[], costUsd: r.cost_usd, error: r.error }));
}

/* ------------------------------------------------------------------ */
/* Telegram reminders                                                   */
/* ------------------------------------------------------------------ */

/** "sending" is held briefly while a tick delivers it, so two ticks can't send it twice. */
export type ReminderStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";
export type Reminder = { id: string; taskId: string; sendAt: string; stepAt: string; text: string; status: ReminderStatus; error: string | null; sentAt: string | null };

const toReminder = (r: Record<string, unknown>): Reminder => ({
  id: r.id as string, taskId: r.task_id as string, sendAt: iso(r.send_at), stepAt: iso(r.step_at), text: r.text as string,
  status: r.status as ReminderStatus, error: (r.error as string) ?? null, sentAt: r.sent_at ? iso(r.sent_at) : null,
});

export async function createReminders(taskId: string, items: { sendAt: Date; stepAt: Date; text: string }[]) {
  if (items.length === 0) return 0;
  await ensureTables();
  const sql = getDb();
  for (const item of items) {
    await sql`INSERT INTO reminders (id, task_id, send_at, step_at, text) VALUES (${randomUUID()}, ${taskId}, ${item.sendAt}, ${item.stepAt}, ${item.text})`;
  }
  return items.length;
}

export async function listReminders(taskId: string): Promise<Reminder[]> {
  await ensureTables();
  const rows = await getDb()`SELECT * FROM reminders WHERE task_id = ${taskId} ORDER BY send_at ASC`;
  return rows.map(toReminder);
}

/** Claims due reminders atomically so two ticks can never send the same one twice. */
export async function claimDueReminders(limit = 20): Promise<Reminder[]> {
  await ensureTables();
  const rows = await getDb()`
    UPDATE reminders SET status = 'sending'
    WHERE id IN (SELECT id FROM reminders WHERE status = 'pending' AND send_at <= now() ORDER BY send_at LIMIT ${limit})
    RETURNING *
  `;
  return rows.map(toReminder);
}

export async function finishReminder(id: string, ok: boolean, error?: string) {
  await ensureTables();
  await getDb()`UPDATE reminders SET status = ${ok ? "sent" : "failed"}, error = ${error ?? null}, sent_at = ${ok ? new Date() : null} WHERE id = ${id}`;
}

export async function cancelReminder(id: string) {
  await ensureTables();
  const rows = await getDb()`UPDATE reminders SET status = 'cancelled' WHERE id = ${id} AND status = 'pending' RETURNING task_id`;
  return rows[0]?.task_id as string | undefined;
}
