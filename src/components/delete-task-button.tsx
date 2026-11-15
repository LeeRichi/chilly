"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSavedTaskAction } from "@/app/agent-actions";
import { removeLocalTask } from "@/lib/local-tasks";

export function DeleteTaskButton({
  taskId,
  deviceId,
  backgroundStored = false,
  onDeleted,
  redirectOnDelete = false,
}: {
  taskId: string;
  deviceId: string;
  backgroundStored?: boolean;
  onDeleted?: () => void;
  redirectOnDelete?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialogId = useId();

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    removeLocalTask(taskId);
    onDeleted?.();
    setConfirming(false);
    if (redirectOnDelete) router.push("/tasks");
    if (backgroundStored) {
      try {
        await deleteSavedTaskAction(taskId, deviceId);
      } catch {
        setError("Removed locally; the background server record couldn’t be cleaned up.");
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <span className="delete-task-wrap">
        <button
          className="delete-task-button"
          type="button"
          aria-label="Delete task"
          title="Delete task"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" />
          </svg>
        </button>
        {error && (
          <small className="delete-task-error" role="alert">
            {error}
          </small>
        )}
      </span>
      {confirming && (
        <div
          className="delete-modal-backdrop"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setConfirming(false);
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setConfirming(false);
          }}
        >
          <section
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-copy`}
          >
            <span className="delete-modal-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" />
              </svg>
            </span>
            <h2 id={`${dialogId}-title`}>Delete this task?</h2>
            <p id={`${dialogId}-copy`}>
              This also removes its progress, watch history, and scheduled reminders. This can’t be
              undone.
            </p>
            {error && (
              <p className="delete-modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="delete-modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setConfirming(false);
                  setError("");
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-delete-button"
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete task"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
