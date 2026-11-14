import "server-only";
import { randomUUID } from "node:crypto";

export type StoredResult = {
  title: string;
  url: string;
  highlights: string[];
  publishedDate?: string;
};

type Entry = { query: string; results: StoredResult[]; expiresAt: number };

// Must outlive the search cache in actions.ts (6h), since cached searches point at these IDs.
const TTL_MS = 8 * 60 * 60 * 1000;

// Evidence stays on the server; the client only gets an opaque ID.
// In-memory is fine for a single dev/demo server. Use Redis or Postgres if this
// is deployed to multiple instances or serverless.
const globalStore = globalThis as unknown as { __butlerResearch?: Map<string, Entry> };
const store = (globalStore.__butlerResearch ??= new Map());

export function saveResearch(query: string, results: StoredResult[]): string {
  const now = Date.now();
  for (const [key, entry] of store) if (entry.expiresAt < now) store.delete(key);
  const id = randomUUID();
  store.set(id, { query, results, expiresAt: now + TTL_MS });
  return id;
}

/** Most recent stored results, newest first (diagnostics only). */
export function latestResearch(limit: number): StoredResult[] {
  return [...store.values()].reverse().flatMap((entry) => entry.results).slice(0, limit);
}

export function loadResearch(ids: string[]): StoredResult[] {
  return ids.flatMap((id) => store.get(id)?.results ?? []);
}
