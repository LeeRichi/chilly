"use client";

import { useState, type ReactNode } from "react";
import { downloadIcs, type CalendarEvent } from "@/lib/ics";
import type { Progress, SourceRef, TaskResult } from "@/lib/schemas";

/* ------------------------------------------------------------------ */
/* Citations                                                            */
/* ------------------------------------------------------------------ */

export type SourceFocus = { active: string | null; setActive: (url: string | null) => void };

function focusSource(url: string) {
  // Folded timeline steps listen for this and unfold before we scroll.
  window.dispatchEvent(new CustomEvent("butler:reveal-source", { detail: url }));
  setTimeout(() => {
    const el = [
      ...document.querySelectorAll<HTMLElement>(`[data-source-url="${CSS.escape(url)}"]`),
    ].find((n) => n.offsetParent !== null);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 60);
}

export function Cite({
  ns,
  sources,
  focus,
}: {
  ns: number[];
  sources: SourceRef[];
  focus: SourceFocus;
}) {
  if (!ns.length)
    return (
      <span className="cite unsourced" title="No verified source for this">
        unsourced
      </span>
    );
  return (
    <>
      {ns.map((n) => {
        const src = sources.find((s) => s.n === n);
        if (!src) return null;
        return (
          <button
            key={n}
            className={`cite ${focus.active === src.url ? "is-active" : ""}`}
            title={src.title}
            onMouseEnter={() => focus.setActive(src.url)}
            onMouseLeave={() => focus.setActive(null)}
            onClick={() => focusSource(src.url)}
          >
            {n}
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Action helpers                                                       */
/* ------------------------------------------------------------------ */

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ghost-button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

const checklistItems = (content: string) =>
  content
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, "").trim())
    .filter(Boolean);

function mailto(recipient: string, subject: string, body: string) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  params.set("body", body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  return `mailto:${encodeURIComponent(recipient)}?${params.toString().replace(/\+/g, "%20")}`;
}

function sourceLines(ns: number[], sources: SourceRef[]) {
  const lines = ns
    .map((n) => sources.find((s) => s.n === n))
    .filter(Boolean)
    .map((s) => `Source: ${s!.title} ${s!.url}`);
  return lines.join("\n");
}

const prettyDate = (datetime: string) =>
  new Date(datetime).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ------------------------------------------------------------------ */
/* Result body                                                          */
/* ------------------------------------------------------------------ */

export function ResultView(props: {
  result: TaskResult;
  sources: SourceRef[];
  focus: SourceFocus;
  progress: Progress;
  onToggle: (key: string, checked: boolean) => void;
  /** Shown next to checklists, e.g. "saved" / "saved when you approve". */
  progressNote?: ReactNode;
  droppedCitations?: number;
  droppedLinks?: number;
  showAgentConversation?: boolean;
}) {
  const { result: r, sources, focus, progress } = props;
  const timeline = r.timeline.map((t) => ({ ...t, datetime: t.datetime ?? "" }));
  const calendarEvents: CalendarEvent[] = timeline
    .filter((t) => t.datetime)
    .map((t) => ({
      datetime: t.datetime,
      title: t.action,
      description: [
        t.note,
        t.isEstimate ? "Time is an estimate." : "",
        sourceLines(t.sources, sources),
      ]
        .filter(Boolean)
        .join("\n"),
    }));

  return (
    <>
      {r.freshness && (
        <div className={`freshness-note is-${r.freshness.status}`}>
          <span className="freshness-badge">
            {r.freshness.status === "checked" ? "CURRENT INFO CHECKED" : "LIVE CHECK FAILED"}
          </span>
          <span>
            {r.freshness.reason}
            {r.freshness.checkedAt ? ` · ${new Date(r.freshness.checkedAt).toLocaleString()}` : ""}
          </span>
        </div>
      )}
      {props.showAgentConversation !== false && r.agentConversation.length > 0 && (
        <section className="agent-conversation" aria-label="Agent conversation">
          <div className="agent-conversation-heading">
            <span className="block-label">MULTI-AGENT REVIEW</span>
            <span>{r.agentConversation.some((turn) => turn.role === "judge") ? "STRATEGIST ∥ CHALLENGER → JUDGE" : "STRATEGIST ↔ CHALLENGER"}</span>
          </div>
          {r.agentConversation.map((turn) => (
            <div className={`agent-turn is-${turn.role}`} key={turn.role}>
              <span className="agent-turn-role">
                {{
                  strategist: "STRATEGIST · PROPOSAL",
                  challenger: "CHALLENGER · REVIEW",
                  judge: "JUDGE · FINAL DECISION",
                  challenge_fit: "CHALLENGE FIT ANALYST",
                  builder: "MVP BUILDER",
                  demo_judge: "DEMO JUDGE",
                  orchestrator: "ORCHESTRATOR · DECISION",
                }[turn.role]}
              </span>
              <p>{turn.message}</p>
            </div>
          ))}
        </section>
      )}
      <p className="result-summary">{r.summary}</p>

      {r.findings.length > 0 && (
        <section className="result-block">
          <span className="block-label">WHAT I FOUND</span>
          <ul className="finding-list">
            {r.findings.map((f, i) => (
              <li key={i}>
                <p>
                  {f.claim} <Cite ns={f.sources} sources={sources} focus={focus} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.options.length > 0 && (
        <section className="result-block">
          <span className="block-label">OPTIONS COMPARED</span>
          <div className="option-grid">
            {r.options.map((o, i) => (
              <div key={i} className="option-card">
                <b>
                  {o.name} <Cite ns={o.sources} sources={sources} focus={focus} />
                </b>
                <p>{o.details}</p>
                {o.pros.length > 0 && (
                  <ul className="pros">
                    {o.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {o.cons.length > 0 && (
                  <ul className="cons">
                    {o.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {timeline.length > 0 && (
        <section className="result-block">
          <div className="block-head">
            <span className="block-label">TIMELINE</span>
            {calendarEvents.length > 0 ? (
              <button className="do-button" onClick={() => downloadIcs(calendarEvents, r.title)}>
                📅 Add {calendarEvents.length} step{calendarEvents.length === 1 ? "" : "s"} to
                calendar
              </button>
            ) : (
              <span className="block-hint">
                No calendar date known yet — tell Chilly the date to enable calendar export.
              </span>
            )}
          </div>
          <ol className="plan-timeline">
            {timeline.map((t, i) => (
              <li key={i}>
                <span className="plan-time">
                  {t.time}
                  {t.datetime && <small>{prettyDate(t.datetime)}</small>}
                  {t.isEstimate && <em>estimate</em>}
                </span>
                <div>
                  <b>{t.action}</b>
                  {t.note && <p>{t.note}</p>}
                </div>
                <span className="plan-cite">
                  {t.sources.length > 0 ? (
                    <Cite ns={t.sources} sources={sources} focus={focus} />
                  ) : t.isEstimate ? null : (
                    <Cite ns={[]} sources={sources} focus={focus} />
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.recommendation && (
        <section className="result-block recommendation">
          <span className="block-label">RECOMMENDATION</span>
          <p>{r.recommendation}</p>
        </section>
      )}

      {r.nextActions.length > 0 && (
        <section className="result-block">
          <span className="block-label">DONE FOR YOU · YOU PRESS THE BUTTON</span>
          <div className="action-list">
            {r.nextActions.map((a, i) => {
              const items = a.type === "checklist" ? checklistItems(a.content) : [];
              const done = items.filter((_, j) => progress[`${i}:${j}`]).length;
              const reminderAt = a.type === "reminder" ? (a.datetime ?? "") : "";
              return (
                <div key={i} className={`action-card type-${a.type}`}>
                  <div className="action-head">
                    <span className="action-type">{a.type.replace("_", " ")}</span>
                    <b>{a.label}</b>
                    {a.type === "checklist" && items.length > 0 && (
                      <span className="check-count">
                        {done}/{items.length} done
                      </span>
                    )}
                    {a.url && (
                      <a className="do-button" href={a.url} target="_blank" rel="noreferrer">
                        Open page ↗
                      </a>
                    )}
                    {a.type === "draft_message" && a.content && (
                      <a
                        className="do-button"
                        href={mailto(a.recipient ?? "", a.subject ?? "", a.content)}
                      >
                        ✉ Open in email{a.recipient ? ` to ${a.recipient}` : ""}
                      </a>
                    )}
                    {reminderAt && (
                      <button
                        className="do-button"
                        onClick={() =>
                          downloadIcs(
                            [
                              {
                                datetime: reminderAt,
                                title: a.label,
                                description: a.content,
                                alarmMinutesBefore: 30,
                              },
                            ],
                            a.label,
                          )
                        }
                      >
                        ⏰ Add reminder · {prettyDate(reminderAt)}
                      </button>
                    )}
                    {a.content && (a.type === "draft_message" || a.type === "checklist") && (
                      <CopyButton text={a.content} />
                    )}
                  </div>
                  {a.type === "draft_message" && a.subject && (
                    <p className="action-subject">Subject: {a.subject}</p>
                  )}
                  {a.type === "checklist" ? (
                    <>
                      <ul className="checklist">
                        {items.map((line, j) => {
                          const key = `${i}:${j}`;
                          return (
                            <li key={key} className={progress[key] ? "is-done" : ""}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={!!progress[key]}
                                  onChange={(e) => props.onToggle(key, e.target.checked)}
                                />{" "}
                                {line}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      {props.progressNote && <p className="progress-note">{props.progressNote}</p>}
                    </>
                  ) : (
                    a.content && <pre className="action-content">{a.content}</pre>
                  )}
                  {a.type === "draft_message" && !a.recipient && (
                    <p className="block-hint">
                      No address found in the sources — add the recipient in your email app.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(r.caveats.length > 0 || !!props.droppedCitations || !!props.droppedLinks) && (
        <section className="result-block caveats">
          <span className="block-label">DOUBLE-CHECK</span>
          <ul>
            {r.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
            {!!props.droppedCitations && (
              <li>
                Chilly removed {props.droppedCitations} citation(s) that didn’t match any source it
                actually read.
              </li>
            )}
            {!!props.droppedLinks && (
              <li>
                Chilly removed {props.droppedLinks} link(s) that didn’t come from its sources.
              </li>
            )}
          </ul>
        </section>
      )}

      {sources.length > 0 && (
        <div className="sources">
          <span className="block-label">SOURCES</span>
          <div>
            {sources.map((s) => (
              <a
                key={s.n}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                data-source-url={s.url}
                className={focus.active === s.url ? "is-active" : ""}
                onMouseEnter={() => focus.setActive(s.url)}
                onMouseLeave={() => focus.setActive(null)}
              >
                <b>{s.n}</b> {s.title}
                <span>↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
