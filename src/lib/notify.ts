import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recordTelegram } from "@/lib/usage";

/* ------------------------------------------------------------------ */
/* Status (names only, never values)                                    */
/* ------------------------------------------------------------------ */

export type IntegrationStatus = {
  telegram: { configured: boolean; connected: boolean; chatName?: string; missing: string[] };
};

export function integrationStatus(): IntegrationStatus {
  const tgMissing = ["TELEGRAM_BOT_TOKEN"].filter((k) => !process.env[k]);
  const chat = telegramChat();
  return {
    telegram: { configured: tgMissing.length === 0, connected: tgMissing.length === 0 && !!chat, chatName: chat?.name, missing: tgMissing },
  };
}

/* ------------------------------------------------------------------ */
/* Telegram                                                             */
/* ------------------------------------------------------------------ */

const SETTINGS = path.join(process.cwd(), ".butler", "settings.json");
type Settings = { telegramChatId?: number; telegramChatName?: string };

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(SETTINGS, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function telegramChat(): { id: string; name: string } | null {
  if (process.env.TELEGRAM_CHAT_ID) return { id: process.env.TELEGRAM_CHAT_ID, name: "configured chat" };
  const s = readSettings();
  return s.telegramChatId ? { id: String(s.telegramChatId), name: s.telegramChatName || "your chat" } : null;
}

async function telegram<T>(method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is missing." };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as { ok: boolean; result?: T; description?: string };
}

/** Finds the chat of whoever last messaged the bot (send it /start first) and remembers it. */
export async function connectTelegram(): Promise<{ ok: true; chatName: string } | { ok: false; error: string }> {
  type Update = { message?: { chat: { id: number; first_name?: string; username?: string; title?: string } } };
  const res = await telegram<Update[]>("getUpdates", { limit: 20 });
  if (!res.ok) return { ok: false, error: res.description || "Telegram request failed." };
  const chat = [...(res.result ?? [])].reverse().find((u) => u.message)?.message?.chat;
  if (!chat) return { ok: false, error: "No messages yet. Open your bot in Telegram, send /start, then try again." };
  const chatName = chat.username ? `@${chat.username}` : chat.first_name || chat.title || "your chat";
  mkdirSync(path.dirname(SETTINGS), { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify({ ...readSettings(), telegramChatId: chat.id, telegramChatName: chatName }, null, 2));
  await sendTelegram("✅ Chilly is connected. You'll get task updates here.");
  return { ok: true, chatName };
}

export async function sendTelegram(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const chat = telegramChat();
  if (!chat) return { ok: false, error: "Telegram isn't connected yet." };
  try {
    const res = await telegram("sendMessage", { chat_id: chat.id, text: text.slice(0, 4000), disable_web_page_preview: true });
    if (!res.ok) return { ok: false, error: res.description || "Telegram send failed." };
    recordTelegram();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Telegram send failed." };
  }
}
