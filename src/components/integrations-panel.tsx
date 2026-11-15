"use client";

import { useEffect, useState } from "react";
import {
  finishTelegramConnectAction,
  getIntegrations,
  startTelegramConnectAction,
} from "@/app/agent-actions";
import type { IntegrationStatus } from "@/lib/notify";
import { getDeviceId } from "@/lib/local-tasks";

export function IntegrationsPanel({
  onStatusChange,
}: {
  onStatusChange?: (status: IntegrationStatus) => void;
}) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [telegramLink, setTelegramLink] = useState("");
  const [deviceId] = useState(() => (typeof window === "undefined" ? "" : getDeviceId()));

  useEffect(() => {
    if (deviceId)
      void getIntegrations(deviceId)
        .then((nextStatus) => {
          setStatus(nextStatus);
          onStatusChange?.(nextStatus);
        })
        .catch(() => {
          const fallback: IntegrationStatus = {
            telegram: {
              configured: false,
              connected: false,
              missing: ["Background storage is unavailable"],
            },
          };
          setStatus(fallback);
          onStatusChange?.(fallback);
        });
  }, [deviceId, onStatusChange]);

  async function connect() {
    setConnecting(true);
    setMessage("");
    const res = await startTelegramConnectAction(deviceId);
    setConnecting(false);
    if (res.ok) setTelegramLink(res.link);
    else setMessage(res.error);
  }

  async function finishConnect() {
    setConnecting(true);
    const res = await finishTelegramConnectAction(deviceId);
    setConnecting(false);
    if (res.ok) {
      setMessage(`Connected to ${res.chatName}. Check Telegram for a test message.`);
      setTelegramLink("");
      const nextStatus = await getIntegrations(deviceId);
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
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
                ? telegram.missing[0] || "Open the bot link and press Start"
                : telegram.missing[0] || "Connect your Telegram chat"}
          </small>
        </span>
        {telegram.configured &&
          !telegram.connected &&
          (telegramLink ? (
            <div className="telegram-connect-actions">
              <a className="ghost-button" href={telegramLink} target="_blank" rel="noreferrer">
                Open Telegram ↗
              </a>
              <button className="ghost-button" onClick={finishConnect} disabled={connecting}>
                {connecting ? "…" : "Finish"}
              </button>
            </div>
          ) : (
            <button className="ghost-button" onClick={connect} disabled={connecting}>
              {connecting ? "…" : "Connect"}
            </button>
          ))}
      </div>
      {message && <p className="usage-note">{message}</p>}
    </div>
  );
}
