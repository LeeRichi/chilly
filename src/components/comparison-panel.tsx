"use client";

import type { ResultResponse } from "./timeline";

export type ComparisonState =
  | { status: "loading" }
  | { status: "done"; model: string; answer: string }
  | { status: "error"; error: string };

export function ComparisonPanel({
  comparison,
  chilly,
  needsClarification,
}: {
  comparison: ComparisonState;
  chilly: ResultResponse | null;
  needsClarification: boolean;
}) {
  return (
    <section className="comparison-panel" aria-label="Compare Chilly and Gemini answers">
      <div className="comparison-heading">
        <span className="block-label">SAME PROMPT · TWO APPROACHES</span>
        <p>
          Gemini answers directly. Chilly searches with Exa, then uses Gemini to build a sourced
          plan.
        </p>
      </div>
      <div className="comparison-grid">
        <article className="comparison-card">
          <header>
            <strong>GEMINI</strong>
            <span></span>
          </header>
          {comparison.status === "loading" && (
            <p className="comparison-pending">
              <span className="spinner" /> Getting a direct answer…
            </p>
          )}
          {comparison.status === "error" && <p className="comparison-error">{comparison.error}</p>}
          {comparison.status === "done" && (
            <>
              <p className="comparison-model">{comparison.model} · direct answer</p>
              <p className="comparison-answer">{comparison.answer}</p>
            </>
          )}
        </article>
        <article className="comparison-card chilly-comparison-card">
          <header>
            <strong>CHILLY</strong>
            <span>EXA SOURCES</span>
          </header>
          {chilly ? (
            <>
              <p className="comparison-model">{chilly.result.title}</p>
              <p className="comparison-answer">{chilly.result.summary}</p>
              {chilly.result.recommendation && (
                <p className="comparison-recommendation">
                  <b>Recommendation</b>
                  {chilly.result.recommendation}
                </p>
              )}
              {chilly.sources.length > 0 && (
                <div className="comparison-sources">
                  {chilly.sources.slice(0, 3).map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title}
                      <span>↗</span>
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : needsClarification ? (
            <p className="comparison-pending">
              Chilly needs a little more detail before it can research and build a plan.
            </p>
          ) : (
            <p className="comparison-pending">
              <span className="spinner" /> Searching sources and building a plan…
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
