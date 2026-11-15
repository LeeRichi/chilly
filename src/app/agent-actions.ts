"use server";

import { z } from "zod";
import {
  cancelReminder,
  countActiveWatches,
  createReminders,
  createWatch,
  deleteTaskAndActivity,
  listReminders,
  type Reminder,
  getWatchWithSeen,
  listActions,
  listWatchRuns,
  listWatches,
  logAction,
  setWatchActive,
  type ActionLog,
  type Watch,
  type WatchRun,
} from "@/lib/agent-store";
import {
  finishTelegramLinkForUser,
  integrationStatus,
  sendTelegram,
  startTelegramLink,
  type IntegrationStatus,
} from "@/lib/notify";
import { approvalSchema, type Approval } from "@/lib/schemas";
import { helsinkiClock, helsinkiDayTime, helsinkiLocalToDate } from "@/lib/time";
import { getLimits, snapshot, type UsageSnapshot } from "@/lib/usage";
import { runWatch, type WatchRunResult } from "@/lib/watch-runner";
import { getOwnedTask } from "@/lib/tasks";
import { deviceOwnsTask } from "@/lib/users";
import { validDeviceId } from "@/lib/device";

const uuid = z.string().uuid();

export async function getIntegrations(deviceId?: string): Promise<IntegrationStatus> {
  return integrationStatus(deviceId && validDeviceId(deviceId) ? deviceId : undefined);
}

export async function deleteSavedTaskAction(taskId: string, deviceId: string) {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false as const, error: "Local workspace not found." };
  const id = uuid.safeParse(taskId);
  if (!id.success) return { ok: false as const, error: "Invalid task." };
  try {
    const deleted = await deleteTaskAndActivity(id.data, ownerId);
    return deleted ? { ok: true as const } : { ok: false as const, error: "Task not found." };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not delete task.",
    };
  }
}

export async function startTelegramConnectAction(deviceId: string) {
  try {
    const ownerId = validDeviceId(deviceId);
    return ownerId
      ? await startTelegramLink(ownerId)
      : { ok: false as const, error: "Local workspace not found." };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Telegram failed.",
    };
  }
}

export async function finishTelegramConnectAction(deviceId: string) {
  try {
    const ownerId = validDeviceId(deviceId);
    return ownerId
      ? await finishTelegramLinkForUser(ownerId)
      : { ok: false as const, error: "Local workspace not found." };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Telegram failed.",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Execute what the user approved                                       */
/* ------------------------------------------------------------------ */

export type ExecutedAction = {
  kind: ActionLog["kind"];
  label: string;
  status: ActionLog["status"];
  detail: string;
  at: string;
};

/**
 * Carries out the approved actions for a saved task. Reads the task back from the database
 * rather than trusting the browser, runs each action, and logs every outcome.
 */
export async function executeApproved(
  taskId: string,
  deviceId: string,
  approval: Approval,
): Promise<
  { ok: true; actions: ExecutedAction[]; usage: UsageSnapshot } | { ok: false; error: string }
> {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false, error: "Local workspace not found." };
  const id = uuid.safeParse(taskId);
  const parsed = approvalSchema.safeParse(approval);
  if (!id.success || !parsed.success) return { ok: false, error: "Invalid approval." };

  const task = await getOwnedTask(id.data, ownerId).catch(() => null);
  if (!task) return { ok: false, error: "Saved task not found." };
  const { result } = task;
  const out: ExecutedAction[] = [];
  const record = async (
    kind: ActionLog["kind"],
    label: string,
    status: ActionLog["status"],
    detail: string,
    extra: Record<string, unknown> = {},
  ) => {
    out.push({ kind, label, status, detail, at: new Date().toISOString() });
    await logAction(task.id, kind, label, status, { detail, ...extra }).catch(() => {});
  };

  // 1. Background watches
  const limits = getLimits();
  const telegramConnected = (await integrationStatus(ownerId)).telegram.connected;
  let active = await countActiveWatches(ownerId).catch(() => 0);
  for (const i of [...new Set(parsed.data.watches)]) {
    const w = result.watches[i];
    if (!w) continue;
    const demoMode = parsed.data.watchModes[String(i)] === "demo";
    if (active >= limits.maxActiveWatches) {
      await record(
        "watch",
        w.reason,
        "skipped",
        `Limit of ${limits.maxActiveWatches} active watches reached. Stop one to add more.`,
      );
      continue;
    }
    const everyMinutes = demoMode
      ? 2
      : (parsed.data.watchIntervals[String(i)] ?? (w.everyHours ?? limits.watchEveryHours) * 60);
    const fallbackUntil = new Date(Date.now() + 14 * 86400_000);
    const suggestedUntil = w.until ? new Date(`${w.until}T23:59:00+02:00`) : fallbackUntil;
    const demoUntil = new Date(Date.now() + 5 * 60_000);
    const safeUntil = demoMode
      ? demoUntil
      : Number.isNaN(suggestedUntil.getTime()) || suggestedUntil.getTime() <= Date.now()
        ? fallbackUntil
        : suggestedUntil;
    const watchId = await createWatch({
      taskId: task.id,
      query: w.query,
      reason: w.reason,
      everyMinutes,
      demoMode,
      until: safeUntil,
      notifyTelegram: telegramConnected,
      seenUrls: task.sources.map((s) => s.url),
    });
    active += 1;
    const cadence =
      everyMinutes < 60
        ? `${everyMinutes}m`
        : everyMinutes % 60
          ? `${Math.floor(everyMinutes / 60)}h ${everyMinutes % 60}m`
          : `${everyMinutes / 60}h`;
    await record(
      "watch",
      w.reason,
      "done",
      demoMode
        ? "Demo mode: simulated news update in 30 seconds"
        : `Fresh-fetching every ${cadence} until ${safeUntil.toLocaleDateString("en-GB")}`,
      { watchId, query: w.query, everyMinutes, demoMode },
    );
  }

  // 2. Telegram reminders: one message shortly before each dated step
  if (parsed.data.reminders) {
    const lead = getLimits().reminderLeadMinutes;
    const steps = [
      ...result.timeline
        .filter((t) => t.datetime)
        .map((t) => ({ at: t.datetime, title: t.action, note: t.note })),
      ...result.nextActions
        .filter((a) => a.type === "reminder" && a.datetime)
        .map((a) => ({ at: a.datetime, title: a.label, note: a.content })),
    ]
      .map((s) => ({ ...s, date: helsinkiLocalToDate(s.at) }))
      .filter((s): s is typeof s & { date: Date } => !!s.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const now = Date.now();
    const future = steps.filter((s) => s.date.getTime() > now).slice(0, 12);
    const items = future.map((s, i) => {
      const next = future[i + 1];
      const sendAt = new Date(Math.max(now + 30_000, s.date.getTime() - lead * 60_000));
      const text = [
        `⏰ ${helsinkiClock(s.date)} — ${s.title}`,
        s.note ? s.note.slice(0, 300) : "",
        next ? `\nNext: ${helsinkiClock(next.date)} ${next.title}` : "\nThat’s the last step. 🎉",
        `\n(${result.title})`,
      ]
        .filter(Boolean)
        .join("\n");
      return { sendAt, stepAt: s.date, text };
    });
    const tg = (await integrationStatus(ownerId)).telegram;
    if (!tg.connected) {
      await record(
        "telegram",
        "Telegram reminders",
        "failed",
        "Telegram isn't connected. Connect it in the sidebar.",
      );
    } else if (items.length === 0) {
      await record(
        "telegram",
        "Telegram reminders",
        "skipped",
        steps.length ? "All dated steps are already in the past." : "No step has a calendar date.",
      );
    } else {
      await createReminders(task.id, items);
      const skipped = steps.length - items.length;
      await record(
        "telegram",
        `Schedule ${items.length} Telegram reminder${items.length === 1 ? "" : "s"}`,
        "done",
        `${lead} min before each step · first: ${helsinkiDayTime(items[0].sendAt)}${skipped ? ` · ${skipped} past step${skipped === 1 ? "" : "s"} skipped` : ""}`,
      );
    }
  }

  // 3. Telegram summary
  if (parsed.data.telegram) {
    const lines = out
      .filter((a) => a.status === "done")
      .map((a) => `• ${a.kind === "watch" ? "👁" : "⏰"} ${a.label} — ${a.detail}`);
    const sent = await sendTelegram(
      `✅ Chilly handled: ${result.title}\n\n${lines.join("\n") || "• Plan saved"}${result.keyChecks.length ? `\n\nStill to check:\n${result.keyChecks.map((k) => `• ${k}`).join("\n")}` : ""}`,
      task.id,
    );
    await record(
      "telegram",
      "Summary to Telegram",
      sent.ok ? "done" : "failed",
      sent.ok ? "Sent" : sent.error,
    );
  }

  return { ok: true, actions: out, usage: snapshot() };
}

/* ------------------------------------------------------------------ */
/* Activity & watches for a task                                        */
/* ------------------------------------------------------------------ */

export type TaskActivity = {
  actions: ActionLog[];
  watches: Watch[];
  runs: WatchRun[];
  reminders: Reminder[];
};

export async function getTaskActivity(taskId: string, deviceId: string): Promise<TaskActivity> {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { actions: [], watches: [], runs: [], reminders: [] };
  if (!(await getOwnedTask(taskId, ownerId)))
    return { actions: [], watches: [], runs: [], reminders: [] };
  const id = uuid.safeParse(taskId);
  if (!id.success) return { actions: [], watches: [], runs: [], reminders: [] };
  const [actions, watches, reminders] = await Promise.all([
    listActions(id.data),
    listWatches(id.data),
    listReminders(id.data),
  ]);
  const runs = await listWatchRuns(watches.map((w) => w.id));
  return { actions, watches, runs, reminders };
}

export async function cancelReminderAction(reminderId: string, deviceId: string) {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false };
  if (!uuid.safeParse(reminderId).success) return { ok: false };
  const taskId = await cancelReminder(reminderId, ownerId);
  if (taskId)
    await logAction(taskId, "telegram", "Reminder", "skipped", {
      detail: "Cancelled by you",
    }).catch(() => {});
  return { ok: !!taskId };
}

/** For demos: schedules a Telegram reminder one minute from now for this task. */
export async function testReminderAction(taskId: string, deviceId: string) {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false as const, error: "Local workspace not found." };
  const id = uuid.safeParse(taskId);
  if (!id.success) return { ok: false as const, error: "Invalid task." };
  if (!(await integrationStatus(ownerId)).telegram.connected)
    return { ok: false as const, error: "Connect Telegram in the sidebar first." };
  const task = await getOwnedTask(id.data, ownerId);
  if (!task) return { ok: false as const, error: "Task not found." };
  const sendAt = new Date(Date.now() + 60_000);
  const first = task.result.timeline[0];
  await createReminders(task.id, [
    {
      sendAt,
      stepAt: sendAt,
      text: `⏰ Test reminder from Chilly\n${first ? `${first.time} — ${first.action}` : task.result.title}\n\n(${task.result.title})`,
    },
  ]);
  await logAction(task.id, "telegram", "Test reminder", "done", {
    detail: `Scheduled for ${helsinkiDayTime(sendAt)}`,
  }).catch(() => {});
  return { ok: true as const, sendAt: sendAt.toISOString() };
}

/** Runs a watch right now (counts against the same budget). */
export async function checkWatchNow(
  watchId: string,
  deviceId: string,
): Promise<WatchRunResult & { usage?: UsageSnapshot }> {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false, error: "Local workspace not found." };
  if (!uuid.safeParse(watchId).success) return { ok: false, error: "Invalid watch." };
  const watch = await getWatchWithSeen(watchId);
  if (!watch || !(await deviceOwnsTask(ownerId, watch.taskId)))
    return { ok: false, error: "Watch not found." };
  const res = await runWatch(watchId, "manual");
  return { ...res, usage: snapshot() };
}

export async function stopWatch(watchId: string, deviceId: string) {
  const ownerId = validDeviceId(deviceId);
  if (!ownerId) return { ok: false };
  if (!uuid.safeParse(watchId).success) return { ok: false };
  const watch = await getWatchWithSeen(watchId);
  if (!watch || !(await deviceOwnsTask(ownerId, watch.taskId))) return { ok: false };
  const ok = await setWatchActive(watchId, false);
  if (ok && watch)
    await logAction(watch.taskId, "watch", watch.reason, "skipped", {
      detail: "Stopped by you",
    }).catch(() => {});
  return { ok };
}
