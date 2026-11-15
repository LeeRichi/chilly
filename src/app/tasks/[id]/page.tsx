import Link from "next/link";
import { Suspense } from "react";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceNav } from "@/components/workspace-nav";
import { LocalTaskDetail } from "@/components/local-task-detail";

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <Link href="/tasks">SAVED TASKS</Link> <span>/</span> TASK
          </div>
          <div className="topbar-right">
            <WorkspaceNav current="tasks" />
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
  const { id } = await params;
  return <LocalTaskDetail taskId={id} />;
}
