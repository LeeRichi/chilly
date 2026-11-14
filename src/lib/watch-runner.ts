import "server-only";
import { getExaClient } from "@/lib/exa";
import { claimDemoWatch, claimDueReminders, dueWatchIds, finishReminder, getWatchWithSeen, recordWatchRunRow, type WatchHit } from "@/lib/agent-store";
import { sendTelegram } from "@/lib/notify";
import { recordWatchRun, reserveExa, settleExa } from "@/lib/usage";

export type WatchRunResult = { ok: true; hits: WatchHit[]; costUsd: number | null; checkedSince: string } | { ok: false; error: string; blocked?: boolean };

/**
 * Re-runs a watch with Exa's fresh-page fetch, keeping only pages published since
 * the last check that Chilly hasn't already shown. Notifies Telegram on new hits.
 */
export async function runWatch(id: string, reason: "scheduled" | "manual"): Promise<WatchRunResult> {
  const watch = await getWatchWithSeen(id);
  if (!watch) return { ok: false, error: "Watch not found." };
  if (!watch.active) return { ok: false, error: "This watch is stopped." };

  if (watch.demoMode) {
    if (!(await claimDemoWatch(id))) return { ok: false, error: "Demo update already triggered." };
    const title = `Demo news: New developments about ${watch.reason}`;
    const hit: WatchHit = {
      title,
      url: "",
      snippet: "Simulated demo content. This is not a real article and was not found by Exa.",
      publishedDate: new Date().toISOString(),
      demo: true,
    };
    await recordWatchRunRow(watch, [hit], watch.seenUrls, 0, null, true);
    if (watch.notifyTelegram) {
      await sendTelegram(`🧪 [DEMO] Simulated news update for “${watch.reason}”\n\n${title}\n\nThis is fake demo data, not a real article.`);
    }
    console.log(`[butler] demo watch ${id.slice(0, 8)} triggered a simulated update`);
    return { ok: true, hits: [hit], costUsd: 0, checkedSince: watch.lastCheckedAt };
  }

  const blocked = reserveExa(`watch:${id}`, { background: true });
  if (blocked) {
    console.log(`[butler] watch ${id.slice(0, 8)} blocked: ${blocked}`);
    return { ok: false, error: blocked, blocked: true };
  }

  // Look back from the last check (minus a day, since publish dates are often date-only).
  const since = new Date(new Date(watch.lastCheckedAt).getTime() - 24 * 3600_000).toISOString();
  const startedAt = Date.now();
  try {
    const response = await getExaClient().search(watch.query, {
      type: "auto",
      numResults: 5,
      startPublishedDate: since,
      // Fetch page contents at check time instead of relying on Exa's cached copy.
      contents: { highlights: { maxCharacters: 400 }, maxAgeHours: 0 },
    }, { timeout: 20_000 });
    const cost = response.costDollars?.total ?? null;
    settleExa(`watch:${id}`, cost ?? undefined);
    recordWatchRun();

    const seen = new Set(watch.seenUrls);
    const hits: WatchHit[] = response.results.filter((r) => !seen.has(r.url)).map((r) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: (r.highlights || []).join(" … ").replace(/\s+/g, " ").slice(0, 240),
      publishedDate: r.publishedDate || undefined,
    }));
    await recordWatchRunRow(watch, hits, [...seen, ...hits.map((h) => h.url)].slice(-300), cost, null);
    console.log(`[butler] watch ${id.slice(0, 8)} (${reason}) "${watch.query}": ${hits.length} new in ${Date.now() - startedAt}ms, $${cost ?? "?"}`);

    if (hits.length > 0 && watch.notifyTelegram) {
      const lines = hits.slice(0, 3).map((h) => `• ${h.title}\n  ${h.url}`).join("\n");
      await sendTelegram(`👁 Chilly found ${hits.length} new update${hits.length === 1 ? "" : "s"} for “${watch.reason}”\n\n${lines}`);
    }
    return { ok: true, hits, costUsd: cost, checkedSince: since };
  } catch (error) {
    settleExa(`watch:${id}`, 0);
    const message = error instanceof Error ? error.message : "Search failed.";
    await recordWatchRunRow(watch, [], watch.seenUrls, null, message).catch(() => {});
    console.log(`[butler] watch ${id.slice(0, 8)} failed: ${message}`);
    return { ok: false, error: message };
  }
}

/** Runs every watch that is due. Called by the scheduler via /api/watches/tick. */
export async function runDueWatches() {
  const ids = await dueWatchIds();
  for (const id of ids) await runWatch(id, "scheduled");
  return ids.length;
}

/** Sends Telegram reminders whose time has come. Called by the scheduler every minute. */
export async function runDueReminders() {
  const due = await claimDueReminders();
  for (const r of due) {
    const sent = await sendTelegram(r.text);
    await finishReminder(r.id, sent.ok, sent.ok ? undefined : sent.error);
    console.log(`[butler] reminder ${r.id.slice(0, 8)} ${sent.ok ? "sent" : `failed: ${sent.error}`}`);
  }
  return due.length;
}
