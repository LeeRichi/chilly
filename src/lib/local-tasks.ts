import type { Clarification, Progress, SourceRef, TaskResult } from "@/lib/schemas";

export type LocalTask = {
  id: string;
  prompt: string;
  clarifications: Clarification[];
  result: TaskResult;
  sources: SourceRef[];
  progress: Progress;
  createdAt: string;
  backgroundStored?: boolean;
};

const DEVICE_KEY = "chilly.device-id.v1";
const TASKS_KEY = "chilly.saved-tasks.v1";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function listLocalTasks(): LocalTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(TASKS_KEY) || "[]") as LocalTask[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function getLocalTask(id: string) {
  return listLocalTasks().find((task) => task.id === id) ?? null;
}

export function saveLocalTask(task: LocalTask) {
  const tasks = listLocalTasks().filter((saved) => saved.id !== task.id);
  localStorage.setItem(TASKS_KEY, JSON.stringify([task, ...tasks]));
}

export function removeLocalTask(id: string) {
  localStorage.setItem(
    TASKS_KEY,
    JSON.stringify(listLocalTasks().filter((task) => task.id !== id)),
  );
}

export function updateLocalProgress(id: string, progress: Progress) {
  const tasks = listLocalTasks().map((task) => (task.id === id ? { ...task, progress } : task));
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}
