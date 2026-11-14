"use client";

import { useEffect, useState } from "react";
import {
  cancelReminderAction,
  checkWatchNow,
  getTaskActivity,
  stopWatch,
  testReminderAction,
  type TaskActivity,
} from "@/app/agent-actions";

const when = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const kindIcon: Record<string, string> = {
  email: "✉",
  watch: "👁",
  telegram: "📱",
  calendar: "📅",
  save: "💾",
};

function relative(iso: string, now: number) {
  const diff = new Date(iso).getTime() - now;
  const h = Math.round(Math.abs(diff) / 3600_000);
  const label = h < 1 ? "< 1h" : h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

export function AgentPanel({ taskId, initial }: { taskId: string; initial: TaskActivity }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => setData(await getTaskActivity(taskId));
  const hasPendingDemo = data.watches.some((w) => w.demoMode && w.active);
  useEffect(() => {
    if (!hasPendingDemo) return;
    let mounted = true;
    const timer = setInterval(() => {
      void getTaskActivity(taskId).then((next) => {
        if (mounted) setData(next);
      });
    }, 5_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [taskId, hasPendingDemo]);

  async function check(id: string) {
    setBusy(id);
    const res = await checkWatchNow(id);
    setNote((n) => ({
      ...n,
      [id]: res.ok
        ? (res.hits.length ? `Found ${res.hits.length} new` : "Nothing new since last check") +
          (res.costUsd != null ? ` · $${res.costUsd.toFixed(4)}` : "")
        : res.error,
    }));
    await refresh();
    setBusy(null);
  }

  async function testReminder() {
    setBusy("test");
    const res = await testReminderAction(taskId);
    setNote((n) => ({
      ...n,
      test: res.ok ? "Scheduled — your phone should buzz in about a minute." : res.error,
    }));
    await refresh();
    setBusy(null);
  }

  async function cancel(id: string) {
    setBusy(id);
    await cancelReminderAction(id);
    await refresh();
    setBusy(null);
  }

  async function stop(id: string) {
    setBusy(id);
    await stopWatch(id);
    await refresh();
    setBusy(null);
  }

  const newHits = data.runs.flatMap((r) =>
    r.hits.map((h) => ({
      ...h,
      ranAt: r.ranAt,
      watch: data.watches.find((w) => w.id === r.watchId)?.reason,
    })),
  );

  return (
    <div className="agent-panel">
      <section className="card-surface agent-card">
        <div className="block-head">
          <span className="block-label">👁 WATCHING IN THE BACKGROUND</span>
          <span className="block-hint">Real watches use Exa · demo mode is simulated</span>
        </div>
        {data.watches.length === 0 ? (
          <p className="block-hint">Nothing is being watched for this task.</p>
        ) : (
          <ul className="watch-list">
            {data.watches.map((w) => {
              const live = w.active && new Date(w.until).getTime() > now;
              return (
                <li key={w.id} className={`watch-row ${live ? "is-live" : ""}`}>
                  <span className={`live-dot ${live ? "" : "is-off"}`} />
                  <div className="watch-main">
                    <b>
                      {w.reason} {w.demoMode && <span className="demo-watch-badge">DEMO</span>}
                    </b>
                    <small>
                      <code>{w.query}</code>
                    </small>
                    <small>
                      {live
                        ? w.demoMode
                          ? `simulated update ${relative(w.nextRunAt, now)} · one-time demo`
                          : `every ${w.everyMinutes < 60 ? `${w.everyMinutes} min` : `${w.everyMinutes / 60}h`} · next check ${relative(w.nextRunAt, now)} · until ${new Date(w.until).toLocaleString()}`
                        : w.demoMode && w.runs > 0
                          ? "Demo update sent · simulation only"
                          : w.active
                            ? "Finished (end date passed)"
                            : "Stopped"}{" "}
                      · {w.runs} check{w.runs === 1 ? "" : "s"}
                      {w.notifyTelegram ? " · 📱 Telegram" : ""}
                    </small>
                    {note[w.id] && <small className="watch-note">{note[w.id]}</small>}
                  </div>
                  {live && (
                    <div className="watch-buttons">
                      {!w.demoMode && (
                        <button
                          className="do-button"
                          onClick={() => void check(w.id)}
                          disabled={busy === w.id}
                        >
                          {busy === w.id ? <span className="spinner" /> : "Check now"}
                        </button>
                      )}
                      <button
                        className="ghost-button"
                        onClick={() => void stop(w.id)}
                        disabled={busy === w.id}
                      >
                        Stop
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {newHits.length > 0 && (
          <>
            <span className="block-label hits-label">WHAT’S NEW</span>
            <div className="source-grid">
              {newHits.slice(0, 12).map((h, i) => {
                const content = (
                  <>
                    <span className="source-meta">
                      <b className={h.demo ? "demo-hit-badge" : "new-badge"}>
                        {h.demo ? "DEMO" : "NEW"}
                      </b>
                      {h.demo
                        ? "SIMULATED · NO SOURCE"
                        : new URL(h.url).hostname.replace(/^www\./, "")}
                      {h.publishedDate && <em>{h.publishedDate.slice(0, 10)}</em>}
                    </span>
                    <span className="source-title">{h.title}</span>
                    {h.snippet && <span className="source-snippet">{h.snippet}</span>}
                    <span className="source-meta">
                      {h.demo ? "simulation" : "found"} {when(h.ranAt)}
                      {h.watch ? ` · ${h.watch}` : ""}
                    </span>
                  </>
                );
                return h.demo ? (
                  <article key={`${h.watch}-${i}`} className="source-card is-new is-demo-hit">
                    {content}
                  </article>
                ) : (
                  <a
                    key={`${h.url}-${i}`}
                    href={h.url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-card is-new"
                  >
                    {content}
                  </a>
                );
              })}
            </div>
          </>
        )}
        {data.runs.length > 0 && (
          <details className="run-log">
            <summary>Check history ({data.runs.length})</summary>
            <ul>
              {data.runs.map((r) => (
                <li key={r.id}>
                  {when(r.ranAt)} · {data.watches.find((w) => w.id === r.watchId)?.reason} ·{" "}
                  {r.error ? `failed: ${r.error}` : `${r.hits.length} new`}
                  {r.costUsd != null ? ` · $${r.costUsd.toFixed(4)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card-surface agent-card">
        <div className="block-head">
          <span className="block-label">⏰ TELEGRAM REMINDERS</span>
          <button
            className="ghost-button"
            onClick={() => void testReminder()}
            disabled={busy === "test"}
          >
            {busy === "test" ? <span className="spinner" /> : "Send a test in 1 min"}
          </button>
        </div>
        {note.test && <p className="block-hint watch-note">{note.test}</p>}
        {data.reminders.length === 0 ? (
          <p className="block-hint">No reminders scheduled for this task.</p>
        ) : (
          <ul className="exec-list">
            {data.reminders.map((r) => {
              const status = r.status === "sending" ? "pending" : r.status;
              return (
                <li
                  key={r.id}
                  className={`exec-row reminder-row is-${status === "sent" ? "done" : status === "failed" ? "failed" : status === "cancelled" ? "skipped" : "pending"}`}
                >
                  <span className="exec-icon">⏰</span>
                  <span className="exec-text">
                    <b>{r.text.split("\n")[0]}</b>
                    <small>
                      {status === "sent" && r.sentAt
                        ? `Sent ${when(r.sentAt)}`
                        : status === "pending"
                          ? `Sends ${when(r.sendAt)} (${relative(r.sendAt, now)})`
                          : status === "failed"
                            ? `Failed: ${r.error}`
                            : "Cancelled"}
                    </small>
                  </span>
                  <span className="exec-status">
                    {status === "sent" ? "✓ sent" : status === "pending" ? "scheduled" : status}
                  </span>
                  {status === "pending" ? (
                    <button
                      className="ghost-button"
                      onClick={() => void cancel(r.id)}
                      disabled={busy === r.id}
                    >
                      Cancel
                    </button>
                  ) : (
                    <time />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card-surface agent-card">
        <span className="block-label">⚡ WHAT CHILLY DID</span>
        {data.actions.length === 0 ? (
          <p className="block-hint">No actions recorded for this task.</p>
        ) : (
          <ul className="exec-list">
            {data.actions.map((a) => (
              <li key={a.id} className={`exec-row is-${a.status}`}>
                <span className="exec-icon">{kindIcon[a.kind] ?? "•"}</span>
                <span className="exec-text">
                  <b>{a.label}</b>
                  <small>{String(a.detail.detail ?? "")}</small>
                </span>
                <span className="exec-status">
                  {a.status === "done" ? "✓ done" : a.status === "failed" ? "✗ failed" : "skipped"}
                </span>
                <time>{when(a.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
