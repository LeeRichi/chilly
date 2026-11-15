import { Sidebar } from "@/components/sidebar";
import { WorkspaceNav } from "@/components/workspace-nav";
import { LocalTaskList } from "@/components/local-task-list";

export default function TasksPage() {
  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            WORKSPACE <span>/</span> SAVED TASKS
          </div>
          <div className="topbar-right">
            <WorkspaceNav current="tasks" />
          </div>
        </header>
        <div className="content">
          <div className="eyebrow">
            <span className="eyebrow-line" /> SAVED ON THIS DEVICE <span className="eyebrow-line" />
          </div>
          <h1>
            Your <em>handled</em> tasks.
          </h1>
          <p className="intro">
            These tasks are stored only in this browser. They won’t appear on other devices.
          </p>
          <LocalTaskList />
        </div>
      </section>
    </main>
  );
}
