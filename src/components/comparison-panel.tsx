"use client";

import { useState } from "react";

export type ComparisonState =
  | { status: "loading" }
  | { status: "done"; model: string; answer: string }
  | { status: "error"; error: string };

export function ComparisonPanel({
  comparison,
  onCompare,
}: {
  comparison: ComparisonState | null;
  onCompare: () => void;
}) {
  const [open, setOpen] = useState(true);

  // Match timeline sessions: completed comparisons fold; failures stay open.
  const shouldOpen = comparison?.status !== "done";
  const [lastComparisonStatus, setLastComparisonStatus] = useState(comparison?.status);
  if (lastComparisonStatus !== comparison?.status) {
    setLastComparisonStatus(comparison?.status);
    setOpen(shouldOpen);
  }

  return (
    <section
      className="comparison-panel"
      aria-label="Optional direct Gemini answer"
      aria-live="polite"
    >
      {!comparison && (
        <button className="direct-gemini-button" type="button" onClick={onCompare}>
          <span className="gemini-badge">Gemini</span>
          Compare to direct Gemini answer
          <span className="direct-gemini-arrow" aria-hidden="true">
            ↘
          </span>
        </button>
      )}

      {comparison && (
        <>
          <button
            className="comparison-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="comparison-content"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="comparison-toggle-title">
              <span className="comparison-chevron" aria-hidden="true">
                {open ? "▾" : "▸"}
              </span>
              DIRECT GEMINI COMPARISON
            </span>
            {!open && (
              <span className="comparison-summary">
                {comparison.status === "done" ? "Gemini answer" : comparison.status}
              </span>
            )}
          </button>
          {open && (
            <div id="comparison-content">
              <div className="comparison-vs">
                <i />
                <span>VS</span>
                <i />
              </div>
              {comparison.status === "loading" && (
                <p className="comparison-pending">
                  <span className="spinner" /> Getting Gemini’s direct answer…
                </p>
              )}
              {comparison.status === "error" && (
                <div className="direct-gemini-error">
                  <p className="comparison-error">{comparison.error}</p>
                  <button className="direct-gemini-retry" type="button" onClick={onCompare}>
                    Retry Gemini answer
                  </button>
                </div>
              )}
              {comparison.status === "done" && (
                <article className="comparison-card comparison-baseline-card">
                  <header>
                    <strong>GEMINI ORIGINAL</strong>
                    <span>SINGLE RESPONSE</span>
                  </header>
                  <p className="comparison-model">{comparison.model}</p>
                  <p className="comparison-answer">{comparison.answer}</p>
                </article>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
