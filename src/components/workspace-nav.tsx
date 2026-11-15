import Link from "next/link";

export function WorkspaceNav({ current }: { current: "home" | "tasks" }) {
  return (
    <nav className="workspace-nav" aria-label="Workspace">
      <Link
        href="/"
        className={current === "home" ? "is-active" : undefined}
        aria-current={current === "home" ? "page" : undefined}
      >
        New task
      </Link>
      <Link
        href="/tasks"
        className={current === "tasks" ? "is-active" : undefined}
        aria-current={current === "tasks" ? "page" : undefined}
      >
        Saved tasks
      </Link>
    </nav>
  );
}
