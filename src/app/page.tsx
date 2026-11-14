"use client";

import { useState, useTransition } from "react";
import { approveAndSave, createDraft, type Draft } from "./actions";

const starters = [
  "Build a fintech app for the Spankki challenge",
  "Help us find an overlooked track with a strong demo idea",
  "Turn our climate-tech concept into a weekend build plan",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setNotice("");
    setSaved(false);
    startTransition(async () => {
      const result = await createDraft(prompt);
      if (result.ok) setDraft(result.data);
      else setNotice(result.error);
    });
  }

  function save() {
    if (!draft) return;
    setNotice("");
    startTransition(async () => {
      const result = await approveAndSave(draft);
      if (result.ok) {
        setSaved(true);
        setNotice(`Saved to Aiven · ${result.data.id.slice(0, 8)}`);
      } else setNotice(result.error);
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="How to Win Junction home">
          <span className="brand-mark">J<span>✳</span></span>
          <span className="brand-copy">junction<span>FIELDNOTES / 26</span></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <button className="nav-item active"><span className="nav-icon">⌘</span> Strategy desk <span className="nav-count">01</span></button>
        <button className="nav-item muted" disabled><span className="nav-icon">▤</span> Saved blueprints</button>
        <div className="side-rule" />
        <div className="side-label">YOUR SESSION</div>
        <div className="session-card"><span className="live-dot" /><div><b>Junction 2026</b><small>Helsinki · 48h build</small></div></div>
        <div className="side-bottom"><div className="secure-icon">◈</div><p><b>Human in the loop</b><br />Nothing is saved until you approve a plan.</p></div>
      </aside>

      <section className="main-column" id="top">
        <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> STRATEGY DESK</div><div className="topbar-right"><span className="status-pill"><i /> SYSTEM READY</span><span className="avatar">J</span></div></header>
        <div className="content">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR HACKATHON, WITH A HEAD START <span className="eyebrow-line" /></div>
          <h1>Good ideas don’t<br /><em>win on their own.</em></h1>
          <p className="intro">Bring us a challenge, a half-formed idea, or just ambition.<br className="desktop-break" /> We’ll turn it into a researched plan your team can act on.</p>

          <div className="composer card-surface">
            <div className="composer-top"><div><span className="step-number">01</span><span className="composer-title">TELL US WHAT YOU’RE THINKING</span></div><span className="input-hint">BE SPECIFIC OR STAY VAGUE. WE CAN WORK WITH BOTH.</span></div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1200} placeholder="We want to build something for a banking challenge, but it needs a surprising angle…" aria-label="Describe your hackathon idea" />
            <div className="composer-footer"><span className="privacy-note"><span>◉</span> Research first. Nothing is saved yet.</span><div className="composer-actions"><span className="char-count">{prompt.length} / 1200</span><button className="generate-button" onClick={generate} disabled={isPending || prompt.trim().length < 8}>{isPending ? <><span className="spinner" /> Researching</> : <>Build my strategy <span>↗</span></>}</button></div></div>
          </div>
          <div className="suggestions"><span className="suggestion-label">NEED A STARTING POINT?</span>{starters.map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}<span>↗</span></button>)}</div>

          {notice && <div className={`notice ${saved ? "success" : ""}`} role="status"><span>{saved ? "✓" : "!"}</span>{notice}</div>}

          {draft ? <section className="draft-section">
            <div className="draft-heading"><div><span className="step-number">02</span><span className="composer-title">YOUR STRATEGY BLUEPRINT</span></div><span className="review-pill">◉ &nbsp; PENDING YOUR REVIEW</span></div>
            <article className="blueprint card-surface">
              <div className="blueprint-top"><div><span className="track-kicker">RECOMMENDED TRACK</span><h2>{draft.trackName}</h2></div><span className="draft-stamp">DRAFT / 01</span></div>
              <div className="blueprint-body">
                <div className="strategy-block"><span className="block-label">THE STRATEGY</span><p>{draft.coreStrategy}</p></div>
                <div className="blueprint-grid"><div><span className="block-label">SUGGESTED STACK</span><ul className="stack-list">{draft.techStack.map((item, i) => <li key={item}><span className="stack-index">0{i + 1}</span>{item}</li>)}</ul></div><div><span className="block-label">48-HOUR BUILD PLAN</span><ol className="steps-list">{draft.actionSteps.map((item, i) => <li key={item}><span>{String(i + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol></div></div>
                {draft.sources.length > 0 && <div className="sources"><span className="block-label">RESEARCHED SOURCES</span><div>{draft.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<span>↗</span></a>)}</div></div>}
              </div>
              <footer className="approval-footer"><div className="approval-copy"><span className="approval-lock">◈</span><span><b>Ready to make it official?</b><small>Review the plan, then save it to your workspace.</small></span></div><button className="approve-button" onClick={save} disabled={isPending || saved}>{isPending ? <><span className="spinner" /> Saving</> : saved ? <>Saved <span>✓</span></> : <>Approve &amp; save <span>↗</span></>}</button></footer>
            </article>
          </section> : <div className="empty-state"><span className="empty-orbit">✳</span><span>YOUR NEXT BIG THING STARTS HERE</span></div>}
          <footer className="page-footer"><span>BUILT FOR THE BOLD.</span><span>JUNCTION 2026 <i>·</i> HELSINKI, FI</span></footer>
        </div>
      </section>
    </main>
  );
}
