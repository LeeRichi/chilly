"use client";

import { useState } from "react";
import type { Progress } from "@/lib/schemas";
import type { LocalTask } from "@/lib/local-tasks";
import { updateLocalProgress } from "@/lib/local-tasks";
import { ResultView } from "./result-view";

type SaveState = "idle" | "saved";

export function SavedTaskView({ task }: { task: LocalTask }) {
  const [progress, setProgress] = useState<Progress>(task.progress);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("idle");

  function toggle(key: string, checked: boolean) {
    const next = { ...progress, [key]: checked };
    setProgress(next);
    updateLocalProgress(task.id, next);
    setState("saved");
  }

  const note = {
    idle: "Ticks are saved in this browser.",
    saved: "✓ Saved locally",
  }[state];

  return (
    <article className="blueprint card-surface result-card">
      <div className="blueprint-top">
        <div>
          <span className="track-kicker">SAVED TASK</span>
          <h2>{task.result.title}</h2>
        </div>
        <span className="draft-stamp">SAVED · {new Date(task.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="blueprint-body">
        <section className="result-block saved-context">
          <span className="block-label">YOU ASKED</span>
          <p className="tl-prompt">“{task.prompt}”</p>
          {task.clarifications.length > 0 && (
            <ul className="answer-list">
              {task.clarifications.map((c) => (
                <li key={c.question}>
                  <span>{c.question}</span>
                  <b>{c.answer}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <ResultView
          result={task.result}
          sources={task.sources}
          focus={{ active, setActive }}
          progress={progress}
          onToggle={toggle}
          progressNote={note}
        />
      </div>
    </article>
  );
}
