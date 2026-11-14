import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceNav } from "@/components/workspace-nav";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { listTasks, type StoredTask } from "@/lib/tasks";

export default function TasksPage() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            WORKSPACE <span>/</span> SAVED TASKS
          </div>
          <div className="topbar-right"><WorkspaceNav current="tasks" /></div>
        </header>
        <div className="content">
          <div className="eyebrow">
            <span className="eyebrow-line" /> STORED IN AIVEN POSTGRESQL{" "}
            <span className="eyebrow-line" />
          </div>
          <h1>
            Your <em>handled</em> tasks.
          </h1>
          <p className="intro">
            Everything you approved, with its sources. Open one to tick things off.
          </p>
          <Suspense
            fallback={
              <div className="empty-state">
                <span className="spinner" /> LOADING YOUR TASKS…
              </div>
            }
          >
            <TaskList />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function progressOf(task: StoredTask) {
  const total = task.result.nextActions.reduce(
    (sum, a) =>
      sum + (a.type === "checklist" ? a.content.split("\n").filter((l) => l.trim()).length : 0),
    0,
  );
  const done = Object.values(task.progress).filter(Boolean).length;
  return { total, done: Math.min(done, total) };
}

async function TaskList() {
  await connection();
  let tasks: StoredTask[];
  try {
    tasks = await listTasks();
  } catch (error) {
    return (
      <div className="notice">
        <span>!</span>Couldn’t load saved tasks:{" "}
        {error instanceof Error ? error.message : "database error"}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-orbit">✳</span>
        <span>NOTHING SAVED YET · APPROVE A PLAN TO SEE IT HERE</span>
      </div>
    );
  }

  const ongoing = tasks.filter((task) => {
    const { total, done } = progressOf(task);
    return total === 0 || done < total;
  });
  const done = tasks.filter((task) => {
    const progress = progressOf(task);
    return progress.total > 0 && progress.done === progress.total;
  });

  return (
    <div className="task-groups">
      <TaskGroup title="Ongoing" tasks={ongoing} />
      <TaskGroup title="Done" tasks={done} />
    </div>
  );
}

function TaskGroup({ title, tasks }: { title: string; tasks: StoredTask[] }) {
  return (
    <section className="task-group" aria-label={`${title} tasks`}>
      <h2 className={`task-group-title ${title === "Done" ? "is-done" : "is-ongoing"}`}>
        {title}
        <span>{tasks.length}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="task-group-empty">No {title.toLowerCase()} tasks.</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const { total, done } = progressOf(task);
            const calendar = task.result.timeline.some((t) => t.datetime);
            return (
              <li className="task-list-item" key={task.id}>
                <div className="task-card card-surface">
                  <Link href={`/tasks/${task.id}`} className="task-row">
                    <div className="task-row-main">
                      <b>{task.result.title}</b>
                      <p>{task.result.summary}</p>
                      <span className="task-row-meta">
                        <span>{new Date(task.createdAt).toLocaleString()}</span>
                        <span>{task.sources.length} sources</span>
                        {calendar && <span>📅 calendar ready</span>}
                        {total > 0 && (
                          <span>
                            {done}/{total} done
                          </span>
                        )}
                      </span>
                    </div>
                    {total > 0 && (
                      <span
                        className="task-ring"
                        style={{ ["--p" as string]: `${(done / total) * 100}%` }}
                      >
                        {Math.round((done / total) * 100)}%
                      </span>
                    )}
                  </Link>
                  <DeleteTaskButton taskId={task.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
