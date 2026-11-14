"use client";

import type { UsageSnapshot } from "@/lib/usage";

function Bar({ label, used, cap, format = (n) => String(n) }: { label: string; used: number; cap: number; format?: (n: number) => string }) {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 100;
  const level = pct >= 90 ? "is-danger" : pct >= 60 ? "is-warn" : "";
  return (
    <div className={`meter ${level}`}>
      <div className="meter-row"><span>{label}</span><b>{format(used)} <i>/ {format(cap)}</i></b></div>
      <div className="meter-track"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function UsageMeter({ usage }: { usage: UsageSnapshot | null }) {
  if (!usage) return <div className="usage-card"><span className="spinner" /> loading usage…</div>;
  const { day, limits, task } = usage;
  return (
    <div className="usage-card">
      <Bar label="Exa spend" used={day.exaUsd} cap={limits.exaDailyUsd} format={usd} />
      <Bar label="Exa searches" used={day.exaSearches} cap={limits.exaDailySearches} />
      <Bar label="Gemini requests" used={day.geminiCalls} cap={limits.geminiDailyCalls} />
      <div className="usage-facts">
        <span>tokens <b>{compact(day.geminiInputTokens)}</b> in · <b>{compact(day.geminiOutputTokens)}</b> out</span>
        <span>cache saved <b>{day.exaCacheHits}</b> searches · <b>{day.geminiCacheHits}</b> drafts</span>
      </div>
      {task && (
        <div className="usage-task">
          <span className="side-label">THIS TASK</span>
          <Bar label="searches" used={task.searches} cap={limits.taskMaxSearches} />
          <Bar label="AI drafts" used={task.drafts} cap={limits.taskMaxDrafts} />
          <div className="usage-facts"><span>spent <b>{usd(task.exaUsd)}</b> · <b>{compact(task.geminiTokens)}</b> tokens</span></div>
        </div>
      )}
      <p className="usage-note">Limits reset daily (Helsinki time). Change them in .env.local.</p>
    </div>
  );
}
