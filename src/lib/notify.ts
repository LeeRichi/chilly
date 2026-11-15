import "server-only";
import { randomBytes } from "node:crypto";
import { recordTelegram } from "@/lib/usage";
import {
  finishTelegramLink,
  ownerForTask,
  setTelegramLinkCode,
  telegramConnection,
  telegramLinkCode,
} from "@/lib/users";

export type IntegrationStatus = {
  telegram: { configured: boolean; connected: boolean; chatName?: string; missing: string[] };
};

type TelegramResult<T> = { ok: boolean; result?: T; description?: string };
async function telegram<T>(
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "Telegram bot isn't configured." };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  return (await res
    .json()
    .catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as TelegramResult<T>;
}

export async function integrationStatus(deviceId?: string): Promise<IntegrationStatus> {
  const hasBot = !!process.env.TELEGRAM_BOT_TOKEN;
  const configured = hasBot && !!process.env.DATABASE_URL;
  const chat = configured && deviceId ? await telegramConnection(deviceId) : null;
  return {
    telegram: {
      configured,
      connected: configured && !!chat,
      chatName: chat?.name,
      missing: configured
        ? deviceId
          ? []
          : ["Open Chilly on this browser to connect Telegram"]
        : [hasBot ? "DATABASE_URL (needed for Telegram setup)" : "TELEGRAM_BOT_TOKEN"],
    },
  };
}

/** Starts a Telegram link for this browser's workspace. */
export async function startTelegramLink(
  userId: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Telegram bot isn't configured." };
  const me = await telegram<{ username?: string }>("getMe");
  if (!me.ok || !me.result?.username)
    return { ok: false, error: me.description || "Couldn't load the Telegram bot." };
  const code = randomBytes(16).toString("hex");
  await setTelegramLinkCode(userId, code);
  return { ok: true, link: `https://t.me/${me.result.username}?start=${code}` };
}

/** Completes only the link challenge issued to this user; another visitor's /start cannot be selected. */
export async function finishTelegramLinkForUser(
  userId: string,
): Promise<{ ok: true; chatName: string } | { ok: false; error: string }> {
  const code = await telegramLinkCode(userId);
  if (!code) return { ok: false, error: "Connection link expired. Start again." };
  type Update = {
    message?: {
      text?: string;
      chat: { id: number; first_name?: string; username?: string; title?: string };
    };
  };
  const updates = await telegram<Update[]>("getUpdates", {
    limit: 100,
    allowed_updates: ["message"],
  });
  if (!updates.ok) return { ok: false, error: updates.description || "Telegram request failed." };
  const message = (updates.result ?? []).find(
    (u) => u.message?.text?.trim() === `/start ${code}`,
  )?.message;
  if (!message)
    return {
      ok: false,
      error: "Open the Telegram link and press Start, then finish connecting here.",
    };
  const chatName = message.chat.username
    ? `@${message.chat.username}`
    : message.chat.first_name || message.chat.title || "Telegram chat";
  const linked = await finishTelegramLink(userId, code, String(message.chat.id), chatName);
  if (!linked) return { ok: false, error: "Connection link expired. Start again." };
  const sent = await sendToChat(
    String(message.chat.id),
    "✅ Chilly is connected. Your task updates will come here.",
  );
  if (sent) recordTelegram();
  return { ok: true, chatName };
}

async function sendToChat(chatId: string, text: string) {
  const result = await telegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
  return result.ok;
}

export async function sendTelegram(
  text: string,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = await ownerForTask(taskId);
  const chat = ownerId ? await telegramConnection(ownerId) : null;
  if (!chat) return { ok: false, error: "This task owner hasn't connected Telegram." };
  try {
    const sent = await sendToChat(chat.id, text);
    if (!sent) return { ok: false, error: "Telegram send failed." };
    recordTelegram();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Telegram send failed." };
  }
}
