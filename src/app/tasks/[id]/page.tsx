import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTaskActivity } from "@/app/agent-actions";
import { AgentPanel } from "@/components/agent-panel";
import { SavedTaskView } from "@/components/saved-task-view";
import { Sidebar } from "@/components/sidebar";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { getTask } from "@/lib/tasks";

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="app-shell">
      <Suspense fallback={<aside className="sidebar" aria-hidden="true" />}>
        <Sidebar />
      </Suspense>
      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/tasks">SAVED TASKS</Link> <span>/</span> TASK
          </div>
          <div className="topbar-right">
            <Link className="ghost-button" href="/">
              ＋ New task
            </Link>
          </div>
        </header>
        <div className="content">
          <Suspense
            fallback={
              <div className="empty-state">
                <span className="spinner" /> LOADING TASK…
              </div>
            }
          >
            <TaskDetail params={params} />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  let task, activity;
  try {
    task = await getTask(id);
    activity = task ? await getTaskActivity(task.id) : null;
  } catch (error) {
    return (
      <div className="notice">
        <span>!</span>Couldn’t load this task:{" "}
        {error instanceof Error ? error.message : "database error"}
      </div>
    );
  }
  if (!task || !activity) notFound();
  return (
    <>
      <div className="task-detail-actions">
        <DeleteTaskButton taskId={task.id} redirectOnDelete />
      </div>
      <AgentPanel taskId={task.id} initial={activity} />
      <SavedTaskView task={task} />
    </>
  );
}
