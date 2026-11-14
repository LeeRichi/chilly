// Runs once when the Next.js server starts.
// Starts Butler's background scheduler: every 15 seconds it pings an internal route that sends due
// Telegram reminders and runs due watches (each watch still runs only on its own cadence).
// The real work happens in the route (normal server context), so this file imports nothing server-only.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;

  const { randomUUID } = await import("node:crypto");
  // Shared secret so only this process (or a cron you configure with the same value) can trigger runs.
  process.env.BUTLER_TICK_TOKEN ||= randomUUID();

  const g = globalThis as unknown as { __butlerTicker?: ReturnType<typeof setInterval> };
  if (g.__butlerTicker) return;

  const url = `http://127.0.0.1:${process.env.PORT || "3000"}/api/watches/tick`;
  const tick = () =>
    void fetch(url, {
      method: "POST",
      headers: { "x-butler-tick": process.env.BUTLER_TICK_TOKEN! },
    }).catch(() => {});
  g.__butlerTicker = setInterval(tick, 15 * 1000);
  setTimeout(tick, 20_000); // catch up shortly after start
  console.log("[butler] background scheduler started (reminders + watches, every 15 seconds)");
}
