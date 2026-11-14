import "server-only";
import postgres from "postgres";

let sql: ReturnType<typeof postgres> | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL is missing. Add your Aiven PostgreSQL URL to .env.local before saving.",
    );
  sql ??= postgres(url, { max: 5, ssl: "require" });
  return sql;
}
