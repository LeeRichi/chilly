import "server-only";
import { getDb } from "@/lib/db";
import {
  clarificationSchema,
  progressSchema,
  sourceRefSchema,
  taskResultSchema,
  type Clarification,
  type Progress,
  type SourceRef,
  type TaskResult,
} from "@/lib/schemas";
import { z } from "zod";

export type StoredTask = {
  id: string;
  prompt: string;
  clarifications: Clarification[];
  result: TaskResult;
  sources: SourceRef[];
  progress: Progress;
  createdAt: string;
};

let ready: Promise<void> | undefined;

/** Creates the table on first use and adds columns introduced later. */
function ensureTable() {
  ready ??= (async () => {
    const sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY,
      prompt text NOT NULL,
      clarifications jsonb NOT NULL,
      result jsonb NOT NULL,
      sources jsonb NOT NULL,
      status text NOT NULL CHECK (status = 'SAVED'),
      owner_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_id uuid`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_owner_created_idx ON tasks (owner_id, created_at DESC)`;
  })().catch((error) => {
    ready = undefined; // allow a retry after e.g. a network blip
    throw error;
  });
  return ready;
}

const rowSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  clarifications: z.array(clarificationSchema),
  result: taskResultSchema,
  sources: z.array(sourceRefSchema),
  progress: progressSchema.catch({}),
  created_at: z.coerce.date(),
});

function toTask(row: unknown): StoredTask | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) return null;
  const { created_at, ...rest } = parsed.data;
  return { ...rest, createdAt: created_at.toISOString() };
}

export async function insertTask(
  task: Omit<StoredTask, "id" | "createdAt">,
  ownerId: string,
  id: string,
) {
  await ensureTable();
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO tasks (id, prompt, clarifications, result, sources, progress, status, owner_id)
    VALUES (${id}, ${task.prompt}, ${sql.json(task.clarifications)}, ${sql.json(task.result)}, ${sql.json(task.sources)}, ${sql.json(task.progress)}, 'SAVED', ${ownerId})
    RETURNING created_at
  `;
  return { id, savedAt: new Date(row.created_at).toISOString() };
}

export async function listTasks(ownerId: string, limit = 50): Promise<StoredTask[]> {
  await ensureTable();
  const rows = await getDb()`
    SELECT id, prompt, clarifications, result, sources, progress, created_at
    FROM tasks WHERE owner_id = ${ownerId} ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map(toTask).filter((t): t is StoredTask => t !== null);
}

export async function getTask(id: string): Promise<StoredTask | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  await ensureTable();
  const [row] = await getDb()`
    SELECT id, prompt, clarifications, result, sources, progress, created_at
    FROM tasks WHERE id = ${id}
  `;
  return row ? toTask(row) : null;
}

export async function getOwnedTask(id: string, ownerId: string): Promise<StoredTask | null> {
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(ownerId).success)
    return null;
  await ensureTable();
  const [row] = await getDb()`
    SELECT id, prompt, clarifications, result, sources, progress, created_at
    FROM tasks WHERE id = ${id} AND owner_id = ${ownerId}
  `;
  return row ? toTask(row) : null;
}

export async function updateProgress(id: string, progress: Progress, ownerId: string) {
  await ensureTable();
  const rows =
    await getDb()`UPDATE tasks SET progress = ${getDb().json(progress)} WHERE id = ${id} AND owner_id = ${ownerId} RETURNING id`;
  return rows.length > 0;
}
