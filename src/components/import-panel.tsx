"use client";

import { useEffect, useRef, useState } from "react";
import { pageImportSchema, type PageImport } from "@/lib/schemas";

const JUNCTION_CHALLENGES_URL = "https://hackjunction.app/participate/45/challenges";

function isJunctionChallengesPage(url: string) {
  if (url === "pasted") return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(^|\.)hackjunction\.app$/i.test(parsed.hostname)
      && /^\/participate\/45\/challenges(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Runs inside the user's own logged-in tab when they click the bookmark.
 * Reads only visible challenge cards/links, then hands them back to the Chilly tab
 * (postMessage to the opener) or copies them to the clipboard.
 * No cookies, tokens or passwords are read or sent.
 */
function bookmarkletSource(butlerOrigin: string) {
  const code = `(()=>{
    const clean=(e)=>((e&&e.innerText)||'').replace(/\\s+/g,' ').trim();
    const visible=(e)=>!!(e&&e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden';
    const main=document.querySelector('main,[role="main"]')||document.body;
    const seen=new Set(),items=[];
    const add=(text,href='')=>{
      text=(text||'').slice(0,500).trim();href=(href||'').slice(0,2000);
      const key=text.toLowerCase();
      if(text.length<4||seen.has(key)||items.length>=80)return;
      seen.add(key);items.push({text,href});
    };
    const links=[...main.querySelectorAll('a[href]')].filter(visible);
    for(const a of links){
      const label=clean(a);if(label.length<4)continue;
      const card=a.closest('[data-challenge-id],[data-testid*="challenge" i],[class*="challenge" i],article,[role="article"],li,[role="listitem"],[class*="card" i]');
      const cardText=clean(card);
      const href=a.href||'';
      const challengeLink=/challenge|track|prize/i.test(href+' '+label);
      const hasCard=!!card&&cardText.length>=label.length&&cardText.length<=1200;
      if(challengeLink||hasCard)add(cardText||label,href);
    }
    if(items.length<3){
      for(const h of main.querySelectorAll('h1,h2,h3,h4,[role="heading"]')){
        if(!visible(h))continue;
        const text=clean(h);if(text.length<4)continue;
        const link=h.closest('a')||h.parentElement?.querySelector('a[href]');
        add(text,link?.href||'');
      }
    }
    if(!items.length){
      for(const a of links.slice(0,80))add(clean(a),a.href||'');
    }
    const d={type:'butler-import',url:location.href.slice(0,2000),title:document.title.slice(0,300),items};
    const s=JSON.stringify(d);
    if(window.opener){window.opener.postMessage(d,${JSON.stringify(butlerOrigin)});alert(items.length?'Sent '+items.length+' visible challenge items to Chilly. Switch back to continue.':'No visible challenges found. Make sure the challenge list is open, then try again.');}
    else if(navigator.clipboard){navigator.clipboard.writeText(s).then(()=>alert(items.length?'Copied '+items.length+' visible items. Paste them into Chilly.':'No visible challenge items found; copied the page details anyway.'),()=>prompt('Copy this and paste it into Chilly:',s));}
    else{prompt('Copy this and paste it into Chilly:',s)}
  })()`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function ImportPanel({ onImport, disabled }: { onImport: (page: PageImport) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const linkRef = useRef<HTMLAnchorElement>(null);
  const openedRef = useRef<Window | null>(null);
  const onImportRef = useRef(onImport);

  useEffect(() => {
    onImportRef.current = onImport;
  }, [onImport]);

  // React blocks javascript: URLs in JSX, so set the bookmarklet href directly.
  useEffect(() => {
    linkRef.current?.setAttribute("href", bookmarkletSource(window.location.origin));
  }, [open]);

  // Only accept messages from the tab Chilly itself opened.
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (!openedRef.current || event.source !== openedRef.current) return;
      const parsed = pageImportSchema.safeParse(event.data);
      if (parsed.success && isJunctionChallengesPage(parsed.data.url)) onImportRef.current(parsed.data);
    }
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  function openPage() {
    setError("");
    openedRef.current = window.open(JUNCTION_CHALLENGES_URL, "butler-import-target");
    if (!openedRef.current) setError("Your browser blocked the new tab. Allow pop-ups for Chilly and try again.");
  }

  function submitPaste() {
    setError("");
    const text = pasted.trim();
    if (!text) return;
    try {
      const parsed = pageImportSchema.safeParse(JSON.parse(text));
      if (parsed.success && isJunctionChallengesPage(parsed.data.url)) return onImport(parsed.data), setPasted("");
    } catch {
      // Not JSON from the bookmarklet: treat as plain text lines.
    }
    const items = text.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 80)
      .map((line) => ({ text: line.slice(0, 300), href: "" }));
    onImport({ type: "butler-import", url: "pasted", title: "Pasted by you", items });
    setPasted("");
  }

  if (!open) {
    return <button className="link-button" onClick={() => setOpen(true)} disabled={disabled}>◈ Import Junction challenges</button>;
  }

  return (
    <div className="import-panel">
      <p className="import-copy">Sign in to Junction in the opened tab if asked. Chilly reads only the challenge list you choose to send; your login session and token stay in your browser.</p>
      <ol className="import-steps">
        <li>
          <span>1</span>
          <div>Drag this to your bookmarks bar (once):
            <a ref={linkRef} className="bookmarklet" onClick={(e) => { e.preventDefault(); setError("Drag it to your bookmarks bar instead of clicking it here."); }}>⇪ Import challenges</a>
          </div>
        </li>
        <li>
          <span>2</span>
          <button className="ghost-button" onClick={openPage} disabled={disabled}>Open Junction challenges ↗</button>
        </li>
        <li><span>3</span><div>On the challenges page, click <b>Import challenges</b>. Chilly collects visible challenge cards and shows them here.</div></li>
      </ol>
      <details className="paste-fallback">
        <summary>Or paste it instead</summary>
        <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the challenge list JSON copied by the bookmarklet" maxLength={20000} />
        <button className="ghost-button" onClick={submitPaste} disabled={disabled || !pasted.trim()}>Use this</button>
      </details>
      {error && <p className="import-error">{error}</p>}
    </div>
  );
}
