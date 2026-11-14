import { runDueReminders, runDueWatches } from "@/lib/watch-runner";

/** Internal: sends due reminders and runs due watches. Called by the scheduler in src/instrumentation.ts. */
export async function POST(request: Request) {
  const token = process.env.BUTLER_TICK_TOKEN;
  if (!token || request.headers.get("x-butler-tick") !== token) return new Response("Forbidden", { status: 403 });
  try {
    // Reminders first: they are time-critical and cost nothing.
    const reminders = await runDueReminders();
    const watches = await runDueWatches();
    return Response.json({ reminders, watches });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "tick failed" }, { status: 500 });
  }
}
