"use client";

import { useRef, useState } from "react";
import { saveProgress } from "@/app/actions";
import type { Progress } from "@/lib/schemas";
import type { StoredTask } from "@/lib/tasks";
import { ResultView } from "./result-view";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SavedTaskView({ task }: { task: StoredTask }) {
  const [progress, setProgress] = useState<Progress>(task.progress);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const latest = useRef(0);

  function toggle(key: string, checked: boolean) {
    const next = { ...progress, [key]: checked };
    setProgress(next);
    setState("saving");
    const request = ++latest.current;
    void saveProgress(task.id, next).then((res) => {
      if (request === latest.current) setState(res.ok ? "saved" : "error");
    });
  }

  const note = { idle: "Ticks are saved to this task.", saving: "Saving…", saved: "✓ Saved to Aiven", error: "Couldn’t save — try again." }[state];

  return (
    <article className="blueprint card-surface result-card">
      <div className="blueprint-top">
        <div><span className="track-kicker">SAVED TASK</span><h2>{task.result.title}</h2></div>
        <span className="draft-stamp">SAVED · {new Date(task.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="blueprint-body">
        <section className="result-block saved-context">
          <span className="block-label">YOU ASKED</span>
          <p className="tl-prompt">“{task.prompt}”</p>
          {task.clarifications.length > 0 && (
            <ul className="answer-list">{task.clarifications.map((c) => <li key={c.question}><span>{c.question}</span><b>{c.answer}</b></li>)}</ul>
          )}
        </section>
        <ResultView result={task.result} sources={task.sources} focus={{ active, setActive }} progress={progress} onToggle={toggle} progressNote={note} />
      </div>
    </article>
  );
}
