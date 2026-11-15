import "server-only";
import { getDb } from "@/lib/db";

let ready: Promise<void> | undefined;
async function ensureDeviceSettings() {
  ready ??= getDb()`
    CREATE TABLE IF NOT EXISTS device_settings (
      device_id uuid PRIMARY KEY,
      telegram_chat_id text,
      telegram_chat_name text,
      telegram_link_code text,
      telegram_link_code_expires timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `
    .then(() => undefined)
    .catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}

export async function telegramConnection(deviceId: string) {
  await ensureDeviceSettings();
  const [row] =
    await getDb()`SELECT telegram_chat_id, telegram_chat_name FROM device_settings WHERE device_id = ${deviceId}`;
  return row?.telegram_chat_id
    ? { id: String(row.telegram_chat_id), name: String(row.telegram_chat_name || "Telegram") }
    : null;
}

export async function setTelegramLinkCode(deviceId: string, code: string) {
  await ensureDeviceSettings();
  await getDb()`
    INSERT INTO device_settings (device_id, telegram_link_code, telegram_link_code_expires)
    VALUES (${deviceId}, ${code}, ${new Date(Date.now() + 10 * 60_000)})
    ON CONFLICT (device_id) DO UPDATE SET telegram_link_code = EXCLUDED.telegram_link_code, telegram_link_code_expires = EXCLUDED.telegram_link_code_expires
  `;
}

export async function telegramLinkCode(deviceId: string) {
  await ensureDeviceSettings();
  const [row] =
    await getDb()`SELECT telegram_link_code, telegram_link_code_expires FROM device_settings WHERE device_id = ${deviceId}`;
  if (
    !row?.telegram_link_code ||
    !row.telegram_link_code_expires ||
    new Date(row.telegram_link_code_expires).getTime() < Date.now()
  )
    return undefined;
  return row.telegram_link_code as string;
}

export async function finishTelegramLink(
  deviceId: string,
  code: string,
  chatId: string,
  chatName: string,
) {
  await ensureDeviceSettings();
  const rows = await getDb()`
    UPDATE device_settings SET telegram_chat_id = ${chatId}, telegram_chat_name = ${chatName}, telegram_link_code = NULL, telegram_link_code_expires = NULL
    WHERE device_id = ${deviceId} AND telegram_link_code = ${code}
    RETURNING device_id
  `;
  return rows.length > 0;
}

export async function deviceOwnsTask(deviceId: string, taskId: string) {
  const rows = await getDb()`SELECT id FROM tasks WHERE id = ${taskId} AND owner_id = ${deviceId}`;
  return rows.length > 0;
}

export async function ownerForTask(taskId: string) {
  const [row] = await getDb()`SELECT owner_id FROM tasks WHERE id = ${taskId}`;
  return row?.owner_id as string | undefined;
}
