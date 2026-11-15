"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ClarifyQuestion, DraftResponse, SearchOutcome } from "@/app/actions";
import Link from "next/link";
import type { AgentRole, AgentTurn, Clarification, PageImport, Progress } from "@/lib/schemas";
import { ResultView, type SourceFocus } from "./result-view";
import { ImportPanel } from "./import-panel";
import type { ExecutedAction } from "@/app/agent-actions";
import type { IntegrationStatus } from "@/lib/notify";

export type { SourceFocus } from "./result-view";

/* ------------------------------------------------------------------ */
/* Step model                                                           */
/* ------------------------------------------------------------------ */

export type StepStatus = "running" | "done" | "failed" | "waiting" | "blocked";

type Base = {
  id: string;
  status: StepStatus;
  startedAt: number;
  durationMs?: number;
  error?: string;
  retry?: () => void;
};

export type ResultResponse = Extract<DraftResponse, { kind: "result" }>;

export type Step = Base &
  (
    | { kind: "task"; prompt: string }
    | {
        kind: "search";
        queries: string[];
        reason: string;
        outcomes?: SearchOutcome[];
        fresh?: boolean;
        deep?: boolean;
      }
    | {
        kind: "draft";
        label: string;
        model?: string;
        note?: string;
        tokens?: { input: number; output: number };
        attempts?: number;
        cached?: boolean;
        evidenceChars?: number;
        sourceCount?: number;
      }
    | {
        kind: "clarify";
        understanding: string;
        questions: ClarifyQuestion[];
        answered?: Clarification[];
      }
    | { kind: "import"; page: PageImport }
    | { kind: "agents"; turns: AgentTurn[]; note?: string }
    | {
        kind: "result";
        response: ResultResponse;
        saving?: boolean;
        progress?: Progress;
        progressSaving?: boolean;
      }
    | { kind: "saved"; savedId: string; savedAt: string }
    | { kind: "execute"; actions: ExecutedAction[] }
  );

const titles: Record<Step["kind"], string> = {
  task: "Task received",
  search: "Searching the web",
  draft: "Thinking",
  clarify: "Chilly needs a detail",
  import: "Imported from your page",
  agents: "Multi-agent review",
  result: "Result · awaiting your approval",
  saved: "Approved & saved",
  execute: "Chilly is doing it",
};

/* ------------------------------------------------------------------ */
/* Shared UI bits                                                       */
/* ------------------------------------------------------------------ */

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return <>{((now - since) / 1000).toFixed(1)}s…</>;
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const formatDuration = (ms: number) =>
  ms < 1000 ? `took ${ms}ms` : `took ${(ms / 1000).toFixed(1)}s`;

/** Finished research steps fold into a one-line title; these stay open. */
const ALWAYS_OPEN: Step["kind"][] = ["task", "result", "saved", "execute"];

function StepShell({
  step,
  title,
  summary,
  children,
}: {
  step: Step;
  title?: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  const collapsible = !ALWAYS_OPEN.includes(step.kind) && !!children;
  const [open, setOpen] = useState(step.status !== "done" || step.kind === "agents");
  const ref = useRef<HTMLLIElement>(null);

  // Fold automatically when a step finishes; unfold if it fails or needs input.
  const [lastStatus, setLastStatus] = useState(step.status);
  if (lastStatus !== step.status) {
    setLastStatus(step.status);
    setOpen(step.status !== "done" || step.kind === "agents");
  }

  // A citation click elsewhere asks the step holding that source card to unfold.
  useEffect(() => {
    if (!collapsible) return;
    const onReveal = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      if (ref.current?.querySelector(`[data-source-url="${CSS.escape(url)}"]`)) setOpen(true);
    };
    window.addEventListener("butler:reveal-source", onReveal);
    return () => window.removeEventListener("butler:reveal-source", onReveal);
  }, [collapsible]);

  const isOpen = !collapsible || open;
  return (
    <li
      ref={ref}
      className={`tl-step is-${step.status} ${collapsible ? "is-collapsible" : ""} ${isOpen ? "is-open" : "is-folded"}`}
    >
      <span className="tl-dot" aria-hidden>
        {{ done: "✓", failed: "!", waiting: "?", blocked: "–", running: "" }[step.status]}
      </span>
      <div className="tl-body">
        <div
          className="tl-head"
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
          role={collapsible ? "button" : undefined}
          aria-expanded={collapsible ? isOpen : undefined}
        >
          <span className="tl-title">
            {collapsible && <span className="tl-chevron">{isOpen ? "▾" : "▸"}</span>}
            {title ?? titles[step.kind]}
          </span>
          {!isOpen && summary && <span className="tl-summary">{summary}</span>}
          <span className="tl-time">
            <time
              dateTime={new Date(step.startedAt).toISOString()}
              title={new Date(step.startedAt).toLocaleString()}
            >
              {clock(step.startedAt)}
            </time>
            <span className="tl-duration">
              {step.status === "running" ? (
                <>
                  <span className="spinner" />
                  <Elapsed since={step.startedAt} />
                </>
              ) : step.status === "waiting" ? (
                "waiting for you"
              ) : step.durationMs ? (
                formatDuration(step.durationMs)
              ) : null}
            </span>
          </span>
        </div>
        {step.status === "failed" && (
          <div className="tl-error">
            <span>{step.error || "This step failed."}</span>
            {step.retry && (
              <button className="ghost-button" onClick={step.retry}>
                Retry ↻
              </button>
            )}
          </div>
        )}
        {step.status === "blocked" && (
          <div className="tl-error is-blocked">
            <span>⛔ Stopped to protect your API budget: {step.error}</span>
          </div>
        )}
        {/* Kept in the DOM when folded so citation links can still find their source card. */}
        <div className="tl-content" hidden={!isOpen}>
          {children}
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Step renderers                                                       */
/* ------------------------------------------------------------------ */

function SearchStep({
  step,
  focus,
  numberOf,
}: {
  step: Extract<Step, { kind: "search" }>;
  focus: SourceFocus;
  numberOf: (url: string) => number | undefined;
}) {
  const outcomes = step.outcomes ?? [];
  const count = outcomes.reduce((sum, o) => sum + o.results.length, 0);
  const cost = outcomes.reduce((sum, o) => sum + (o.costDollars ?? 0), 0);
  const modes = [
    ...new Set(
      outcomes
        .filter((o) => !o.cached)
        .map((o) => o.searchType)
        .filter(Boolean),
    ),
  ];
  const allCached = outcomes.length > 0 && outcomes.every((o) => o.cached);
  const maxAge = outcomes.find((o) => o.maxAgeHours != null)?.maxAgeHours;
  const isDeep = step.deep || outcomes.some((outcome) => outcome.requestedSearchType === "deep");
  const title = (
    <>
      <span className="exa-badge">{isDeep ? "Exa Deep" : "Exa"}</span>
      {step.fresh && <span className="freshness-badge">LIVE FETCH</span>}
      {step.status === "done"
        ? `Found ${count} sources`
        : step.status === "blocked"
          ? "Search skipped"
          : isDeep
            ? "Running multi-step research"
            : "Searching the web"}
    </>
  );
  const domains = [...new Set(outcomes.flatMap((o) => o.results.map((r) => r.domain)))]
    .slice(0, 3)
    .join(", ");
  return (
    <StepShell
      step={step}
      title={title}
      summary={`${domains}${allCached ? " · cached" : ` · $${cost.toFixed(3)}`}`}
    >
      <p className="tl-reason">{step.reason}</p>
      {step.status === "done" && (
        <div className="exa-meta">
          {allCached ? (
            <span className="meta-good">reused from cache · no API call</span>
          ) : (
            <span>search: {modes.join(", ") || "auto"}</span>
          )}
          <span>highlights: query-relevant passages</span>
          {isDeep && (
            <span>
              grounded findings:{" "}
              {outcomes.reduce((sum, outcome) => sum + (outcome.deepFindings ?? 0), 0)}
            </span>
          )}
          {maxAge != null && (
            <span>
              {step.fresh
                ? "page content fetched live for this request"
                : `re-fetched if older than ${maxAge}h`}
            </span>
          )}
          <span className={cost === 0 ? "meta-good" : ""}>cost: ${cost.toFixed(4)}</span>
        </div>
      )}
      <div className="query-list">
        {step.queries.map((q) => {
          const o = outcomes.find((x) => x.query === q);
          const state = !o
            ? ""
            : o.blocked
              ? "blocked"
              : o.error
                ? "failed"
                : o.cached
                  ? `${o.results.length} · cached`
                  : `${o.results.length} · ${(o.durationMs / 1000).toFixed(1)}s`;
          return (
            <span
              key={q}
              className={`query-chip ${o?.error ? "is-failed" : o?.blocked ? "is-blocked" : ""}`}
              title={o?.blocked || o?.error}
            >
              ⌕ {q}
              {o && <i>{state}</i>}
            </span>
          );
        })}
      </div>
      {step.outcomes && (
        <div className="source-grid">
          {step.outcomes
            .flatMap((o) => o.results)
            .map((r, i) => {
              const n = numberOf(r.url);
              return (
                <a
                  key={`${r.url}-${i}`}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  data-source-url={r.url}
                  className={`source-card ${focus.active === r.url ? "is-active" : ""}`}
                  onMouseEnter={() => focus.setActive(r.url)}
                  onMouseLeave={() => focus.setActive(null)}
                >
                  <span className="source-meta">
                    {n != null && <b className="source-n">{n}</b>}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${r.domain}&sz=32`}
                      alt=""
                      width={14}
                      height={14}
                    />
                    {r.domain}
                    {r.publishedDate && <em>{r.publishedDate.slice(0, 10)}</em>}
                  </span>
                  <span className="source-title">{r.title}</span>
                  {r.snippet && <span className="source-snippet">{r.snippet}</span>}
                </a>
              );
            })}
        </div>
      )}
    </StepShell>
  );
}

function ClarifyStep({
  step,
  onAnswer,
  onImport,
  busy,
}: {
  step: Extract<Step, { kind: "clarify" }>;
  onAnswer: (answers: Clarification[]) => void;
  onImport: (page: PageImport) => void;
  busy: boolean;
}) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});

  if (step.answered) {
    return (
      <StepShell step={step} title="You answered">
        <ul className="answer-list">
          {step.answered.map((a) => (
            <li key={a.question}>
              <span>{a.question}</span>
              <b>{a.answer}</b>
            </li>
          ))}
        </ul>
      </StepShell>
    );
  }

  const answers = step.questions
    .map((q, i) => ({
      question: q.question,
      answer: [picked[i], typed[i]?.trim()].filter(Boolean).join(" — "),
    }))
    .filter((a) => a.answer);

  return (
    <StepShell step={step}>
      <p className="tl-reason">{step.understanding}</p>
      <div className="question-list">
        {step.questions.map((q, i) => (
          <div key={q.question} className="question-card">
            <p className="question-text">{q.question}</p>
            {q.options.length > 0 && (
              <div className="option-chips">
                {q.options.map((o) => (
                  <span
                    key={o.label}
                    className={`option-chip ${picked[i] === o.label ? "is-picked" : ""}`}
                  >
                    <button
                      onClick={() =>
                        setPicked((p) => ({ ...p, [i]: p[i] === o.label ? "" : o.label }))
                      }
                      disabled={busy}
                    >
                      {o.label}
                    </button>
                    {o.sourceUrl && (
                      <a href={o.sourceUrl} target="_blank" rel="noreferrer" title={o.sourceUrl}>
                        ↗
                      </a>
                    )}
                  </span>
                ))}
              </div>
            )}
            {q.allowFreeText && (
              <input
                className="free-text"
                value={typed[i] ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, [i]: e.target.value }))}
                placeholder="Or type your answer…"
                maxLength={300}
                disabled={busy}
              />
            )}
          </div>
        ))}
      </div>
      <div className="clarify-footer">
        <ImportPanel onImport={onImport} disabled={busy} />
        <button
          className="generate-button"
          onClick={() => onAnswer(answers)}
          disabled={busy || answers.length === 0}
        >
          Continue <span>↗</span>
        </button>
      </div>
    </StepShell>
  );
}

function ImportStep({ step }: { step: Extract<Step, { kind: "import" }> }) {
  return (
    <StepShell step={step} title={`Imported ${step.page.items.length} items from your page`}>
      <p className="tl-reason">
        {step.page.title}
        {step.page.url.startsWith("http") ? ` · ${new URL(step.page.url).hostname}` : ""}
      </p>
      <div className="query-list">
        {step.page.items.slice(0, 12).map((item, i) => (
          <span key={i} className="query-chip">
            {item.text}
          </span>
        ))}
        {step.page.items.length > 12 && (
          <span className="query-chip">+{step.page.items.length - 12} more</span>
        )}
      </div>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Approval card: what you must check, and what Chilly will do          */
/* ------------------------------------------------------------------ */

export type Selection = {
  watches: number[];
  watchIntervals: Record<number, number>;
  watchModes: Record<number, "real" | "demo">;
  calendar: boolean;
  telegram: boolean;
  reminders: boolean;
};

function ActionRow({
  checked,
  onChange,
  disabled,
  icon,
  label,
  detail,
  cost,
  locked,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  icon: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  cost?: string;
  locked?: boolean;
}) {
  return (
    <label className={`will-row ${disabled ? "is-disabled" : ""} ${checked ? "is-on" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || locked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="will-icon">{icon}</span>
      <span className="will-text">
        <b>{label}</b>
        {detail && <small>{detail}</small>}
      </span>
      {cost && <span className={`will-cost ${cost === "free" ? "is-free" : ""}`}>{cost}</span>}
    </label>
  );
}

function TelegramIcon() {
  return (
    <svg className="telegram-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#26a5e4" />
      <path
        d="m18.9 6.2-2.1 10.2c-.2.8-.8 1-1.5.6l-4.1-3-2 1.9c-.2.2-.4.4-.8.4l.3-4.2 7.6-6.9c.3-.3-.1-.4-.5-.1l-9.4 5.9-4-1.2c-.9-.3-.9-.9.2-1.3l15.6-6c.7-.3 1.3.2 1.1 1.1Z"
        fill="white"
      />
    </svg>
  );
}

function ResultCard({
  step,
  focus,
  onApprove,
  onToggle,
  savedId,
  integrations,
  watchEveryHours,
  reminderLeadMinutes,
}: {
  step: Extract<Step, { kind: "result" }>;
  focus: SourceFocus;
  onApprove: (selection: Selection) => void;
  onToggle: (key: string, checked: boolean) => void;
  savedId?: string;
  integrations: IntegrationStatus | null;
  watchEveryHours: number;
  reminderLeadMinutes: number;
}) {
  const { result, sources, droppedCitations, droppedLinks } = step.response;
  const saved = !!savedId;
  const tgOk = !!integrations?.telegram.connected;

  const watches = result.watches ?? [];
  const calendarCount = result.timeline.filter((t) => t.datetime).length;
  const reminderCount =
    calendarCount + result.nextActions.filter((a) => a.type === "reminder" && a.datetime).length;
  const checks = (result.keyChecks?.length ? result.keyChecks : result.caveats).slice(0, 3);

  const [sel, setSel] = useState<Selection>(() => ({
    watches: watches.map((_, i) => i),
    watchIntervals: Object.fromEntries(
      watches.map((w, i) => [i, (w.everyHours ?? watchEveryHours) === 1 ? 60 : 1440]),
    ),
    watchModes: Object.fromEntries(watches.map((_, i) => [i, "real"])),
    calendar: calendarCount > 0,
    telegram: tgOk,
    reminders: false,
  }));
  const [full, setFull] = useState(false);
  const toggleIn = (list: number[], i: number, on: boolean) =>
    on ? [...new Set([...list, i])] : list.filter((x) => x !== i);
  const count =
    sel.watches.length +
    (sel.calendar ? 1 : 0) +
    (sel.telegram ? 1 : 0) +
    (sel.reminders ? 1 : 0) +
    1;

  return (
    <StepShell step={step} title={saved ? "Approved" : titles.result}>
      <article className="blueprint card-surface result-card approval-card">
        <div className="blueprint-top">
          <div>
            <span className="track-kicker">CHILLY’S PLAN</span>
            <h2>{result.title}</h2>
            {result.freshness && (
              <div className={`freshness-note is-${result.freshness.status}`}>
                <span className="freshness-badge">
                  {result.freshness.status === "checked"
                    ? "CURRENT INFO CHECKED"
                    : "LIVE CHECK FAILED"}
                </span>
                <span>
                  {result.freshness.reason}
                  {result.freshness.checkedAt
                    ? ` · ${new Date(result.freshness.checkedAt).toLocaleString()}`
                    : ""}
                </span>
              </div>
            )}
          </div>
          <span className="draft-stamp">{saved ? "APPROVED" : "PENDING APPROVAL"}</span>
        </div>
        <div className="blueprint-body">
          <p className="result-summary is-clamped">{result.summary}</p>

          {checks.length > 0 && (
            <section className="approval-block checks">
              <span className="block-label">BEFORE YOU APPROVE</span>
              <ul>
                {checks.map((c) => (
                  <li key={c}>
                    <span>!</span>
                    {c}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="approval-block">
            <span className="block-label">
              {saved ? "CHILLY DID" : "WHEN YOU APPROVE, CHILLY WILL"}
            </span>
            <div className="will-list">
              {calendarCount > 0 && (
                <ActionRow
                  icon="📅"
                  checked={sel.calendar}
                  disabled={saved}
                  onChange={(v) => setSel((s) => ({ ...s, calendar: v }))}
                  label={`Add ${calendarCount} step${calendarCount === 1 ? "" : "s"} to your calendar`}
                  detail="Downloads a calendar file with reminders"
                  cost="free"
                />
              )}
              {reminderCount > 0 && (
                <ActionRow
                  icon={<TelegramIcon />}
                  checked={sel.reminders}
                  disabled={!tgOk || saved}
                  onChange={(v) => setSel((s) => ({ ...s, reminders: v }))}
                  label="Remind me on Telegram before each step"
                  detail={
                    tgOk
                      ? `${reminderLeadMinutes} min before each step · Chilly sends them, you don’t have to do anything`
                      : "Connect Telegram in the sidebar first"
                  }
                  cost="free"
                />
              )}
              {watches.map((w, i) => (
                <div
                  className={`watch-approval${sel.watches.includes(i) ? " is-on" : ""}${saved ? " is-disabled" : ""}`}
                  key={`w${i}`}
                >
                  <label className="watch-heading">
                    <input
                      type="checkbox"
                      checked={sel.watches.includes(i)}
                      disabled={saved}
                      onChange={(e) =>
                        setSel((s) => ({ ...s, watches: toggleIn(s.watches, i, e.target.checked) }))
                      }
                    />
                    <span className="watch-heading-copy">
                      <span className="watch-live-label">
                        <i /> {sel.watchModes[i] === "demo" ? "DEMO SIMULATION" : "LIVE UPDATES"}
                        {sel.watchModes[i] !== "demo" && (
                          <>
                            <span>· EXA</span>
                            {sel.watchIntervals[i] >= 60 && (
                              <span className="exa-badge exa-deep-watch-badge">EXA DEEP</span>
                            )}
                          </>
                        )}
                      </span>
                      <strong>{w.reason}</strong>
                    </span>
                  </label>
                  <div className="watch-query">{w.query}</div>
                  <div className="watch-notify-note">
                    {!sel.watches.includes(i)
                      ? "Updates are off until this watch is selected"
                      : tgOk
                        ? `New matching updates will be sent to Telegram · ${integrations?.telegram.chatName}`
                        : "New updates will appear in the saved task · connect Telegram for alerts"}
                  </div>
                  <div className="watch-demo-control">
                    <span>Demo mode</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sel.watchModes[i] === "demo"}
                      aria-label={`Demo mode for ${w.reason}`}
                      disabled={saved}
                      className={`demo-switch${sel.watchModes[i] === "demo" ? " is-on" : ""}`}
                      onClick={() =>
                        setSel((s) => ({
                          ...s,
                          watchModes: {
                            ...s.watchModes,
                            [i]: s.watchModes[i] === "demo" ? "real" : "demo",
                          },
                        }))
                      }
                    >
                      <i />
                    </button>
                  </div>
                  {sel.watchModes[i] === "demo" ? (
                    <div className="watch-demo-note">
                      <b>SIMULATED NEWS IN 30 SECONDS</b>
                      <span>Clearly labeled fake update · no Exa search or cost</span>
                    </div>
                  ) : (
                    <div className="watch-window">
                      <span className="watch-window-label">TRACK FOR EVERY</span>
                      <div
                        className="watch-window-options"
                        role="group"
                        aria-label={`Check frequency for ${w.reason}`}
                      >
                        {[
                          { minutes: 2, label: "2 min" },
                          { minutes: 60, label: "1 hour" },
                          { minutes: 180, label: "3 hours" },
                          { minutes: 360, label: "6 hours" },
                          { minutes: 1440, label: "24 hours" },
                        ].map((option) => (
                          <button
                            key={option.minutes}
                            type="button"
                            className={
                              sel.watchIntervals[i] === option.minutes ? "is-selected" : ""
                            }
                            aria-pressed={sel.watchIntervals[i] === option.minutes}
                            disabled={saved}
                            onClick={() =>
                              setSel((s) => ({
                                ...s,
                                watchIntervals: { ...s.watchIntervals, [i]: option.minutes },
                              }))
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <small>
                        {sel.watchIntervals[i] >= 60 ? "Exa Deep" : "Exa Auto"} fresh-fetches new
                        pages at this interval · ~$0.02 per check
                      </small>
                    </div>
                  )}
                </div>
              ))}
              <ActionRow
                icon={<TelegramIcon />}
                checked={sel.telegram}
                disabled={!tgOk || saved}
                onChange={(v) => setSel((s) => ({ ...s, telegram: v }))}
                label="Send this one-time plan summary on Telegram"
                detail={
                  tgOk
                    ? `One message after approval · ${integrations?.telegram.chatName}`
                    : "Connect Telegram in the sidebar first"
                }
                cost="free"
              />
              <ActionRow
                icon="💾"
                checked
                locked
                label="Save the plan and its sources"
                detail="Saved in this browser · no account needed"
                cost="free"
              />
            </div>
          </section>

          <button className="link-button full-toggle" onClick={() => setFull((f) => !f)}>
            {full ? "▾ Hide full plan" : "▸ Show full plan"} · {result.findings.length} findings ·{" "}
            {sources.length} sources
          </button>
          {full && (
            <div className="full-plan">
              <ResultView
                result={result}
                sources={sources}
                focus={focus}
                progress={step.progress ?? {}}
                onToggle={onToggle}
                droppedCitations={droppedCitations}
                droppedLinks={droppedLinks}
                showAgentConversation={false}
                progressNote={
                  saved
                    ? step.progressSaving
                      ? "Saving ticks…"
                      : "✓ Ticks are saved to this task"
                    : "Your ticks are saved with the task when you approve."
                }
              />
            </div>
          )}
        </div>
        <footer className="approval-footer">
          <div className="approval-copy">
            <span className="approval-lock">◈</span>
            <span>
              <b>
                {saved
                  ? "Done. Chilly keeps watching in the background."
                  : "Nothing happens until you approve."}
              </b>
              <small>
                {saved
                  ? "Open the task to see updates and activity."
                  : "Untick anything you don’t want Chilly to do."}
              </small>
            </span>
          </div>
          {saved ? (
            <Link className="approve-button" href={`/tasks/${savedId}`}>
              Open task <span>↗</span>
            </Link>
          ) : (
            <button
              className="approve-button"
              onClick={() => onApprove(sel)}
              disabled={step.saving}
            >
              {step.saving ? (
                <>
                  <span className="spinner" /> Working
                </>
              ) : (
                <>
                  Approve {count} action{count === 1 ? "" : "s"} <span>↗</span>
                </>
              )}
            </button>
          )}
        </footer>
      </article>
    </StepShell>
  );
}

function AgentConversationStep({ step }: { step: Extract<Step, { kind: "agents" }> }) {
  return (
    <StepShell step={step}>
      <section className="agent-conversation" aria-label="Multi-agent conversation">
        <div className="agent-conversation-heading">
          <span className="block-label">MULTI-AGENT REVIEW</span>
          <span>
            {step.turns.some((turn) => turn.role === "judge")
              ? "STRATEGIST ∥ CHALLENGER → JUDGE"
              : "STRATEGIST ↔ CHALLENGER"}
          </span>
        </div>
        <div className="agent-chat-thread">
          {step.note && <p className="tl-reason">{step.note}</p>}
          {step.turns.map((turn) => (
            <div className={`agent-message-row is-${turn.role}`} key={turn.role}>
              <AgentAvatar role={turn.role} />
              <div className="agent-message-bubble">
                <span className="agent-turn-role">{agentRoleLabel(turn.role)}</span>
                <p>{turn.message}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </StepShell>
  );
}

function agentRoleLabel(role: AgentRole) {
  const labels: Record<AgentRole, string> = {
    strategist: "STRATEGIST · PROPOSAL",
    challenger: "CHALLENGER · REVIEW",
    judge: "JUDGE · FINAL DECISION",
    challenge_fit: "CHALLENGE FIT ANALYST",
    builder: "MVP BUILDER",
    demo_judge: "DEMO JUDGE",
    orchestrator: "ORCHESTRATOR · DECISION",
  };
  return labels[role];
}

function AgentAvatar({ role }: { role: AgentRole }) {
  const palette =
    role === "judge"
      ? {
          shellStart: "#b6edff",
          shellMid: "#4a8da5",
          shellEnd: "#234b5b",
          antenna: "#78d8f2",
          antennaGlow: "#b1efff",
          side: "#315f70",
          shellStroke: "#71c3db",
          eye: "#b2efff",
          mouth: "#78d8f2",
          mouthPath: "M27 40h10",
        }
      : role === "challenger" || role === "demo_judge" || role === "builder"
        ? {
            shellStart: "#ffc27e",
            shellMid: "#b9713f",
            shellEnd: "#603c2c",
            antenna: "#ed9a5c",
            antennaGlow: "#ffb174",
            side: "#8e5238",
            shellStroke: "#d58b5c",
            eye: "#ffbd83",
            mouth: "#f29a66",
            mouthPath: "M27 40h10",
          }
        : {
            shellStart: "#efff9b",
            shellMid: "#8fa63b",
            shellEnd: "#465625",
            antenna: "#d9f578",
            antennaGlow: "#e5ff87",
            side: "#687b31",
            shellStroke: "#d9ef8b",
            eye: "#e2ff79",
            mouth: "#b7d95b",
            mouthPath: "M28 40h8",
          };
  const prefix = role;

  return (
    <span
      className={`agent-avatar is-${role}`}
      role="img"
      aria-label={`${agentRoleLabel(role).toLowerCase()} agent`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id={`${prefix}-shell`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={palette.shellStart} />
            <stop offset="0.48" stopColor={palette.shellMid} />
            <stop offset="1" stopColor={palette.shellEnd} />
          </linearGradient>
          <linearGradient id={`${prefix}-visor`} x1="0" x2="0.9" y1="0" y2="1">
            <stop offset="0" stopColor="#303c36" />
            <stop offset="1" stopColor="#111813" />
          </linearGradient>
          <filter id={`${prefix}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.48" />
          </filter>
        </defs>
        <ellipse cx="32" cy="56" rx="18" ry="4" fill="#000" opacity="0.28" />
        <g filter={`url(#${prefix}-shadow)`}>
          <path
            d="M32 14V9"
            fill="none"
            stroke={palette.antenna}
            strokeLinecap="round"
            strokeWidth="3"
          />
          <circle cx="32" cy="7" r="3.5" fill={palette.antennaGlow} />
          <rect x="7" y="27" width="8" height="17" rx="4" fill={palette.side} />
          <rect x="49" y="27" width="8" height="17" rx="4" fill={palette.side} />
          <rect
            x="12"
            y="14"
            width="40"
            height="39"
            rx="14"
            fill={`url(#${prefix}-shell)`}
            stroke={palette.shellStroke}
            strokeOpacity="0.75"
          />
          <path
            d="M19 19c3-3 8-4 13-4h5c-10 2-15 8-15 18v7c-4-4-6-9-6-14 0-3 1-5 3-7Z"
            fill="#fff"
            opacity="0.15"
          />
          <rect x="17" y="25" width="30" height="19" rx="8" fill={`url(#${prefix}-visor)`} />
          <circle cx="25" cy="34" r="2.7" fill={palette.eye} />
          <circle cx="39" cy="34" r="2.7" fill={palette.eye} />
          <path
            d={palette.mouthPath}
            stroke={palette.mouth}
            strokeLinecap="round"
            strokeWidth="1.8"
          />
          <circle cx="20" cy="47" r="1.5" fill="#fff" opacity="0.55" />
          <circle cx="44" cy="47" r="1.5" fill="#fff" opacity="0.55" />
        </g>
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Execution log                                                        */
/* ------------------------------------------------------------------ */

const kindIcon: Record<ExecutedAction["kind"], string> = {
  email: "✉",
  watch: "👁",
  telegram: "📱",
  calendar: "📅",
  save: "💾",
};

function ExecuteStep({ step }: { step: Extract<Step, { kind: "execute" }> }) {
  const done = step.actions.filter((a) => a.status === "done").length;
  return (
    <StepShell
      step={step}
      title={
        step.status === "running"
          ? "Chilly is doing it"
          : `Executed ${done} of ${step.actions.length} actions`
      }
    >
      <ul className="exec-list">
        {step.actions.map((a, i) => (
          <li key={i} className={`exec-row is-${a.status}`}>
            <span className="exec-icon">{kindIcon[a.kind]}</span>
            <span className="exec-text">
              <b>{a.label}</b>
              <small>{a.detail}</small>
            </span>
            <span className="exec-status">
              {a.status === "done" ? "✓ done" : a.status === "failed" ? "✗ failed" : "skipped"}
            </span>
            <time>
              {new Date(a.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </li>
        ))}
        {step.status === "running" && (
          <li className="exec-row is-running">
            <span className="spinner" /> working…
          </li>
        )}
      </ul>
    </StepShell>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                             */
/* ------------------------------------------------------------------ */

export function Timeline(props: {
  steps: Step[];
  busy: boolean;
  focus: SourceFocus;
  integrations: IntegrationStatus | null;
  watchEveryHours: number;
  reminderLeadMinutes: number;
  onAnswer: (stepId: string, answers: Clarification[]) => void;
  onImport: (page: PageImport) => void;
  onApprove: (stepId: string, selection: Selection) => void;
  onToggle: (stepId: string, key: string, checked: boolean) => void;
  onNewTask: () => void;
}) {
  const { steps, busy, focus } = props;
  // Number sources the way the latest draft numbered them, so search cards and [n] badges match.
  const latestSources =
    [...steps].reverse().find((s): s is Extract<Step, { kind: "result" }> => s.kind === "result")
      ?.response.sources ?? [];
  const numberOf = (url: string) => latestSources.find((s) => s.url === url)?.n;
  const savedId = steps.find(
    (s): s is Extract<Step, { kind: "saved" }> => s.kind === "saved" && s.status === "done",
  )?.savedId;

  return (
    <ol className="timeline">
      {steps.map((step) => {
        switch (step.kind) {
          case "task":
            return (
              <StepShell key={step.id} step={step}>
                <p className="tl-prompt">“{step.prompt}”</p>
              </StepShell>
            );
          case "search":
            return <SearchStep key={step.id} step={step} focus={focus} numberOf={numberOf} />;
          case "draft":
            return (
              <StepShell
                key={step.id}
                step={step}
                title={step.label}
                summary={
                  step.model &&
                  (step.cached
                    ? "cached · no API call"
                    : `${step.model} · ${((step.tokens?.input ?? 0) + (step.tokens?.output ?? 0)).toLocaleString()} tokens`)
                }
              >
                {step.note && <p className="tl-reason">{step.note}</p>}
                {step.status === "done" && step.model && (
                  <div className="exa-meta">
                    <span>
                      <span className="gemini-badge">Gemini</span>
                      {step.model}
                    </span>
                    {step.cached ? (
                      <span className="meta-good">reused from cache · no API call</span>
                    ) : (
                      <>
                        <span>
                          read {step.sourceCount} sources · {step.evidenceChars?.toLocaleString()}{" "}
                          chars
                        </span>
                        <span>
                          tokens: {step.tokens?.input.toLocaleString()} in ·{" "}
                          {step.tokens?.output.toLocaleString()} out
                        </span>
                        <span>
                          {step.attempts} request{step.attempts === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </StepShell>
            );
          case "clarify":
            return (
              <ClarifyStep
                key={step.id}
                step={step}
                busy={busy}
                onAnswer={(a) => props.onAnswer(step.id, a)}
                onImport={props.onImport}
              />
            );
          case "import":
            return <ImportStep key={step.id} step={step} />;
          case "agents":
            return <AgentConversationStep key={step.id} step={step} />;
          case "result":
            return (
              <ResultCard
                key={step.id}
                step={step}
                focus={focus}
                savedId={savedId}
                integrations={props.integrations}
                watchEveryHours={props.watchEveryHours}
                reminderLeadMinutes={props.reminderLeadMinutes}
                onApprove={(sel) => props.onApprove(step.id, sel)}
                onToggle={(key, checked) => props.onToggle(step.id, key, checked)}
              />
            );
          case "execute":
            return <ExecuteStep key={step.id} step={step} />;
          case "saved":
            return (
              <StepShell key={step.id} step={step} title={<>Saved on this device</>}>
                {step.status === "done" && (
                  <>
                    <p className="tl-reason">
                      Task {step.savedId.slice(0, 8)} · {new Date(step.savedAt).toLocaleString()}
                    </p>
                    <div className="saved-actions">
                      <Link className="ghost-button" href={`/tasks/${step.savedId}`}>
                        Open task ↗
                      </Link>
                      <Link className="ghost-button" href="/tasks">
                        All saved tasks
                      </Link>
                      <button className="ghost-button" onClick={props.onNewTask}>
                        ＋ Start a new task
                      </button>
                    </div>
                  </>
                )}
              </StepShell>
            );
        }
      })}
    </ol>
  );
}
