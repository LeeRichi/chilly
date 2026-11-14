"use client";

import { createElement, useEffect, useRef, useState, type ElementType } from "react";
import Script from "next/script";
import {
  approveAndSave,
  compareDirect as compareDirectAction,
  draftTask,
  getUsage,
  runResearch,
  saveProgress,
  type DraftInput,
} from "./actions";
import { executeApproved, getIntegrations, type ExecutedAction } from "./agent-actions";
import { Timeline, type ResultResponse, type Selection, type Step } from "@/components/timeline";
import { Sidebar } from "@/components/sidebar";
import { PepperIcon } from "@/components/pepper-icon";
import { downloadIcs } from "@/lib/ics";
import { ComparisonPanel, type ComparisonState } from "@/components/comparison-panel";
import type { IntegrationStatus } from "@/lib/notify";
import type { Clarification, PageImport } from "@/lib/schemas";
import type { UsageSnapshot } from "@/lib/usage";

const starters = [
  { prompt: "I'm an international student in Finland. Which benefits can I apply for?" },
  // { prompt: "Find the cheapest fuel near me in Finland and tell me when prices are likely to be lower." },
  { prompt: "Help me win Junction today.", icon: "💀" },
  { prompt: "Track the latest Nvidia earnings and stock moves after Jensen Huang’s resignation." },
];

type Context = Omit<DraftInput, "round"> & {
  round: number;
  followUpDone: boolean;
  deepResearch: boolean;
};

let counter = 0;
const newId = () => `step-${Date.now()}-${counter++}`;

function createChiliViewer() {
  return createElement(
    "div",
    { className: "chili-model-stage", "aria-label": "3D chili model" },
    createElement("model-viewer" as ElementType, {
      src: "/models/chili.glb",
      alt: "A rotating 3D chili pepper",
      "auto-rotate": true,
      "rotation-per-second": "40deg",
      "camera-controls": true,
      "disable-zoom": true,
      "camera-orbit": "auto auto 120%",
      "min-camera-orbit": "auto auto 100%",
      "max-camera-orbit": "auto auto 140%",
      "max-field-of-view": "50deg",
      "min-field-of-view": "30deg",
      className: "chili-model",
    }),
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [deepResearch, setDeepResearch] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);

  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    void getUsage().then(setUsage);
    void getIntegrations().then(setIntegrations);
  }, []);
  const ctx = useRef<Context | null>(null);
  const run = useRef(0); // bumps on every new task so stale async work is ignored
  const savedTaskId = useRef<string | null>(null);

  const busy = steps.some((s) => s.status === "running");
  const chillyResponse =
    [...steps]
      .reverse()
      .find((step): step is Extract<Step, { kind: "result" }> => step.kind === "result")
      ?.response ?? null;
  const needsClarification = steps.some(
    (step) => step.kind === "clarify" && step.status === "waiting",
  );

  const add = (step: Step) => setSteps((prev) => [...prev, step]);
  const patch = (id: string, changes: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...changes } as Step) : s)));

  /* -------------------------- pipeline stages -------------------------- */

  async function search(queries: string[], reason: string, token: number): Promise<boolean> {
    const deep = !!ctx.current?.deepResearch;
    const id = newId();
    const startedAt = Date.now();
    add({ id, kind: "search", status: "running", startedAt, queries, reason, deep });
    const res = await runResearch(ctx.current!.taskId, queries, { deep });
    if (token !== run.current) return false;
    if (res.usage) setUsage(res.usage);
    const durationMs = Date.now() - startedAt;
    const retry = () => void searchThenDraft(queries, reason, token);
    if (!res.ok) {
      patch(id, { status: "failed", durationMs, error: res.error, retry });
      return false;
    }
    const good = res.data.filter((o) => o.researchId);
    if (good.length === 0) {
      const blocked = res.data.find((o) => o.blocked)?.blocked;
      patch(
        id,
        blocked
          ? ({ status: "blocked", durationMs, outcomes: res.data, error: blocked } as Partial<Step>)
          : ({
              status: "failed",
              durationMs,
              outcomes: res.data,
              error: res.data[0]?.error || "Search failed.",
              retry,
            } as Partial<Step>),
      );
      return false;
    }
    ctx.current!.researchIds.push(...good.map((o) => o.researchId!));
    patch(id, { status: "done", durationMs, outcomes: res.data } as Partial<Step>);
    return true;
  }

  async function draft(token: number, label = "Reading sources & drafting"): Promise<void> {
    const c = ctx.current!;
    const id = newId();
    const startedAt = Date.now();
    add({ id, kind: "draft", status: "running", startedAt, label });
    const res = await draftTask({
      taskId: c.taskId,
      prompt: c.prompt,
      clarifications: c.clarifications,
      researchIds: c.researchIds.slice(-12),
      imports: c.imports.slice(-3),
      round: c.round,
    });
    if (token !== run.current) return;
    if (res.usage) setUsage(res.usage);
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      patch(
        id,
        res.blocked
          ? { status: "blocked", durationMs, error: res.error }
          : {
              status: "failed",
              durationMs,
              error: res.error,
              retry: () => void draft(token, label),
            },
      );
      return;
    }
    const data = res.data;
    const meta = {
      model: data.model,
      tokens: data.tokens,
      attempts: data.attempts,
      cached: data.cached,
      evidenceChars: data.evidenceChars,
      sourceCount: data.sources.length,
    };

    if (data.kind === "clarify") {
      patch(id, {
        status: "done",
        durationMs,
        ...meta,
        note: "needs more detail from you",
      } as Partial<Step>);
      add({
        id: newId(),
        kind: "clarify",
        status: "waiting",
        startedAt: Date.now(),
        understanding: data.understanding,
        questions: data.questions,
      });
      return;
    }

    if (data.followUpQueries.length > 0 && !c.followUpDone) {
      c.followUpDone = true;
      patch(id, {
        status: "done",
        durationMs,
        ...meta,
        note: `wants ${data.followUpQueries.length} more search(es) first`,
      } as Partial<Step>);
      if (
        await search(data.followUpQueries, "Chilly asked for more specific information.", token)
      ) {
        await draft(token, "Drafting with the new sources");
      } else if (token === run.current) {
        // Follow-up searches were blocked or failed: the first draft is still a usable result.
        const response = data as ResultResponse;
        if (response.agentConversation.length > 0)
          add({
            id: newId(),
            kind: "agents",
            status: "done",
            startedAt: Date.now(),
            turns: response.agentConversation,
          });
        add({ id: newId(), kind: "result", status: "waiting", startedAt: Date.now(), response });
      }
      return;
    }

    patch(id, { status: "done", durationMs, ...meta } as Partial<Step>);
    const response = data as ResultResponse;
    if (response.agentConversation.length > 0)
      add({
        id: newId(),
        kind: "agents",
        status: "done",
        startedAt: Date.now(),
        turns: response.agentConversation,
      });
    add({ id: newId(), kind: "result", status: "waiting", startedAt: Date.now(), response });
  }

  async function searchThenDraft(queries: string[], reason: string, token: number) {
    const found = await search(queries, reason, token);
    if (!found) return;
    await draft(token);
  }

  /* ---------------------------- user actions --------------------------- */

  function start() {
    const text = prompt.trim();
    if (text.length < 8 || busy) return;
    const token = ++run.current;
    const taskId = crypto.randomUUID();
    ctx.current = {
      taskId,
      prompt: text,
      clarifications: [],
      researchIds: [],
      imports: [],
      round: 0,
      followUpDone: false,
      deepResearch,
    };
    setSteps([
      {
        id: newId(),
        kind: "task",
        status: "done",
        startedAt: Date.now(),
        durationMs: 0,
        prompt: text,
      },
    ]);
    setComparison({ status: "loading" });
    void compareDirect(text, taskId, token);
    void searchThenDraft([text], "Searching the web for your task.", token);
  }

  async function compareDirect(text: string, taskId: string, token: number) {
    const result = await compareDirectAction({ taskId, prompt: text });
    if (token !== run.current) return;
    if (result.usage) setUsage(result.usage);
    setComparison(
      result.ok
        ? { status: "done", model: result.data.model, answer: result.data.answer }
        : { status: "error", error: result.error },
    );
  }

  function answer(stepId: string, answers: Clarification[]) {
    const c = ctx.current;
    if (!c || busy) return;
    patch(stepId, { status: "done", answered: answers } as Partial<Step>);
    c.clarifications.push(...answers);
    c.round += 1;
    c.followUpDone = false;
    setComparison({ status: "loading" });
    void compareDirect(
      [c.prompt, ...c.clarifications.map((item) => `${item.question}: ${item.answer}`)]
        .join("\n\n")
        .slice(0, 1200),
      c.taskId,
      run.current,
    );
    const query = `${c.prompt} ${answers.map((a) => a.answer).join(" ")}`.slice(0, 400);
    void searchThenDraft([query], "Searching again with your answers.", run.current);
  }

  function importPage(page: PageImport) {
    const c = ctx.current;
    if (!c || busy) return;
    setSteps((prev) =>
      prev.map((s) =>
        s.kind === "clarify" && s.status === "waiting"
          ? {
              ...s,
              status: "done",
              answered: [
                {
                  question: s.questions[0]?.question ?? "Imported data",
                  answer: `Sent ${page.items.length} items from “${page.title}”`,
                },
              ],
            }
          : s,
      ),
    );
    add({
      id: newId(),
      kind: "import",
      status: "done",
      startedAt: Date.now(),
      durationMs: 0,
      page,
    });
    c.imports.push(page);
    c.round += 1;
    c.followUpDone = false;
    void draft(run.current, "Reading your page & drafting");
  }

  /** Save first (everything else hangs off the saved task), then carry out what the user ticked. */
  async function approve(stepId: string, selection: Selection) {
    const c = ctx.current;
    const step = steps.find((s) => s.id === stepId);
    if (!c || !step || step.kind !== "result") return;
    const { result, sources } = step.response;
    patch(stepId, { saving: true } as Partial<Step>);
    const res = await approveAndSave({
      prompt: c.prompt,
      clarifications: c.clarifications,
      result,
      sources,
      progress: step.progress ?? {},
    });
    if (!res.ok) {
      patch(stepId, { saving: false } as Partial<Step>);
      add({
        id: newId(),
        kind: "saved",
        status: "failed",
        startedAt: Date.now(),
        savedId: "",
        savedAt: "",
        error: res.error,
        retry: () => void approve(stepId, selection),
      });
      return;
    }
    savedTaskId.current = res.data.id;
    add({
      id: newId(),
      kind: "saved",
      status: "done",
      startedAt: Date.now(),
      durationMs: 0,
      savedId: res.data.id,
      savedAt: res.data.savedAt,
    });

    const execId = newId();
    const startedAt = Date.now();
    const local: ExecutedAction[] = [];
    if (selection.calendar) {
      const events = result.timeline
        .filter((t) => t.datetime)
        .map((t) => ({ datetime: t.datetime, title: t.action, description: t.note }));
      downloadIcs(events, result.title);
      local.push({
        kind: "calendar",
        label: `Add ${events.length} steps to calendar`,
        status: "done",
        detail: "Calendar file downloaded — open it to import",
        at: new Date().toISOString(),
      });
    }
    add({ id: execId, kind: "execute", status: "running", startedAt, actions: local });

    const exec = await executeApproved(res.data.id, {
      watches: selection.watches,
      watchIntervals: Object.fromEntries(
        Object.entries(selection.watchIntervals).map(([i, minutes]) => [i, minutes]),
      ),
      watchModes: Object.fromEntries(
        Object.entries(selection.watchModes).map(([i, mode]) => [i, mode]),
      ),
      telegram: selection.telegram,
      reminders: selection.reminders,
    });
    patch(stepId, { saving: false } as Partial<Step>);
    if (!exec.ok) {
      patch(execId, {
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: exec.error,
      } as Partial<Step>);
      return;
    }
    setUsage(exec.usage);
    patch(execId, {
      status: "done",
      durationMs: Date.now() - startedAt,
      actions: [...local, ...exec.actions],
    } as Partial<Step>);
  }

  /** Ticks are kept locally until approval; after that each tick is saved to the task in Aiven. */
  function toggle(stepId: string, key: string, checked: boolean) {
    const step = steps.find((s) => s.id === stepId);
    if (!step || step.kind !== "result") return;
    const next = { ...step.progress, [key]: checked };
    const id = savedTaskId.current;
    patch(stepId, { progress: next, progressSaving: !!id } as Partial<Step>);
    if (id)
      void saveProgress(id, next).then(() =>
        patch(stepId, { progressSaving: false } as Partial<Step>),
      );
  }

  function newTask() {
    run.current += 1;
    ctx.current = null;
    savedTaskId.current = null;
    setSteps([]);
    setComparison(null);
    setPrompt("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------------------------------- view ------------------------------- */

  return (
    <main className="app-shell">
      <Script
        src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"
        type="module"
        strategy="afterInteractive"
      />
      <Sidebar usage={usage} />

      <section className="main-column" id="top">
        <header className="topbar">
          <div className="breadcrumb">
            WORKSPACE <span>/</span> NEW TASK
          </div>
        </header>
        <div className="content">
          <section className="landing-section" aria-label="Chilly introduction">
            <div className="hero-title">
              <div className="hero-left">
                {createChiliViewer()}
                <span className="hero-brand">chilly</span>
              </div>
              <div className="hero-right">
                <h1>
                  Your up-to-date
                  <br />
                  <em>assistant.</em>
                </h1>
              </div>
            </div>
            <ul className="feature-list">
              <li>
                <PepperIcon className="feature-pepper" />
                <span>Live web research, saved plans &amp; tracking</span>
                <span className="feature-badges">
                  <b className="exa-badge">EXA</b>
                  <b className="aiven-badge">AIVEN POSTGRES</b>
                </span>
              </li>
              <li>
                <PepperIcon className="feature-pepper" />
                <span>Plans that update as new information comes in</span>
                <span className="feature-badges">
                  <b className="exa-badge">EXA</b>
                </span>
              </li>
              <li>
                <PepperIcon className="feature-pepper" />
                <span>Every recommendation backed by visible sources</span>
                <span className="feature-badges">
                  <b className="exa-badge">EXA</b>
                </span>
              </li>
              <li>
                <PepperIcon className="feature-pepper" />
                <span>Review first, then act with calendar, reminders &amp; Telegram</span>
              </li>
            </ul>
            <button
              className="try-out-button"
              type="button"
              onClick={() =>
                document.getElementById("prompt-section")?.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "auto"
                    : "smooth",
                  block: "start",
                })
              }
            >
              Try it out <span aria-hidden="true">↓</span>
            </button>
          </section>

          <section className="prompt-section" id="prompt-section" aria-label="Try Chilly">
            <div className="composer card-surface">
              <div className="composer-top">
                <div>
                  <span className="step-number">01</span>
                  <span className="composer-title">WHAT DO YOU NEED DONE?</span>
                </div>
                <span className="input-hint">VAGUE IS FINE. CHILLY WILL ASK.</span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={1200}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
                }}
                placeholder="My rent went up 15% — is that legal in Helsinki, and what can I do?"
                aria-label="Describe your task"
              />
              <div className="composer-footer">
                <span className="privacy-note">
                  <span>◉</span> Read-only research. Nothing is saved yet.
                </span>
                <div className="composer-actions">
                  <label className="deep-research-toggle" title="Exa Deep research">
                    <span className="exa-badge exa-deep-badge">EXA DEEP</span>
                    <input
                      type="checkbox"
                      checked={deepResearch}
                      onChange={(e) => setDeepResearch(e.target.checked)}
                      disabled={busy}
                      aria-label="Use Exa Deep research"
                    />
                    <span className="deep-research-switch" aria-hidden="true" />
                  </label>
                  <button
                    className="generate-button"
                    onClick={start}
                    disabled={busy || prompt.trim().length < 8}
                  >
                    {busy ? (
                      <>
                        <span className="spinner" /> Working
                      </>
                    ) : (
                      <>
                        Hand it off <span>↗</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="suggestions">
              <span className="suggestion-label">TRY A REAL CASE</span>
              {starters.map((item) => (
                <button key={item.prompt} onClick={() => setPrompt(item.prompt)} disabled={busy}>
                  {item.prompt}
                  {item.icon && (
                    <span className="starter-skull" aria-label="skeleton">
                      {item.icon}
                    </span>
                  )}
                  <span className="starter-arrow">↗</span>
                </button>
              ))}
            </div>

            <section className="draft-section">
              <div className={`draft-heading${prompt.trim().length === 0 ? " is-empty" : ""}`}>
                <div>
                  <span className="step-number">02</span>
                  <span className="composer-title">WHAT CHILLY IS DOING</span>
                </div>
              </div>
              <Timeline
                steps={steps}
                busy={busy}
                focus={{ active: activeSource, setActive: setActiveSource }}
                integrations={integrations}
                watchEveryHours={usage?.limits.watchEveryHours ?? 24}
                reminderLeadMinutes={usage?.limits.reminderLeadMinutes ?? 10}
                onAnswer={answer}
                onImport={importPage}
                onApprove={(id, sel) => void approve(id, sel)}
                onToggle={toggle}
                onNewTask={newTask}
              />
              {comparison && (
                <ComparisonPanel
                  comparison={comparison}
                  chilly={chillyResponse}
                  needsClarification={needsClarification}
                />
              )}
            </section>
          </section>
          <footer className="page-footer">
            <span>SOURCES FIRST. YOU DECIDE.</span>
            <span>
              JUNCTION 2026 <i>·</i> HELSINKI, FI
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
