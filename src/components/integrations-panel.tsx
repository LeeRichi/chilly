"use client";

import { useEffect, useState } from "react";
import { connectTelegramAction, getIntegrations } from "@/app/agent-actions";
import type { IntegrationStatus } from "@/lib/notify";

export function IntegrationsPanel() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getIntegrations().then(setStatus);
  }, []);

  async function connect() {
    setConnecting(true);
    setMessage("");
    const res = await connectTelegramAction();
    setConnecting(false);
    if (res.ok) {
      setMessage(`Connected to ${res.chatName}. Check Telegram for a test message.`);
      setStatus(await getIntegrations());
    } else setMessage(res.error);
  }

  if (!status)
    return (
      <div className="usage-card">
        <span className="spinner" /> checking…
      </div>
    );
  const { telegram } = status;

  return (
    <div className="usage-card integrations">
      <div className={`integ-row ${telegram.connected ? "is-on" : ""}`}>
        <span className="integ-dot" />
        <span>
          <b>Telegram</b>
          <small>
            {telegram.connected
              ? `Connected · ${telegram.chatName}`
              : telegram.configured
                ? "Send /start to your bot, then connect"
                : `Add ${telegram.missing.join(" + ")}`}
          </small>
        </span>
        {telegram.configured && !telegram.connected && (
          <button className="ghost-button" onClick={connect} disabled={connecting}>
            {connecting ? "…" : "Connect"}
          </button>
        )}
      </div>
      {message && <p className="usage-note">{message}</p>}
    </div>
  );
}
