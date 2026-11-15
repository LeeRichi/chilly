"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTaskActivity, type TaskActivity } from "@/app/agent-actions";
import { AgentPanel } from "@/components/agent-panel";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { SavedTaskView } from "@/components/saved-task-view";
import { getDeviceId, getLocalTask, type LocalTask } from "@/lib/local-tasks";

const emptyActivity: TaskActivity = { actions: [], watches: [], runs: [], reminders: [] };

export function LocalTaskDetail({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<LocalTask | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [activity, setActivity] = useState(emptyActivity);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = getDeviceId();
      const localTask = getLocalTask(taskId);
      setDeviceId(id);
      setTask(localTask);
      if (localTask?.backgroundStored)
        void getTaskActivity(taskId, id)
          .then(setActivity)
          .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [taskId]);

  if (!deviceId)
    return (
      <div className="empty-state">
        <span className="spinner" /> LOADING TASK…
      </div>
    );
  if (!task)
    return (
      <div className="empty-state">
        <span>THIS TASK ISN’T SAVED IN THIS BROWSER</span>
        <Link className="ghost-button" href="/tasks">
          Back to Saved tasks
        </Link>
      </div>
    );

  return (
    <>
      <div className="task-detail-actions">
        <DeleteTaskButton
          taskId={task.id}
          deviceId={deviceId}
          backgroundStored={task.backgroundStored}
          redirectOnDelete
        />
      </div>
      {task.backgroundStored ? (
        <AgentPanel taskId={task.id} deviceId={deviceId} initial={activity} />
      ) : (
        <p className="block-hint">
          This task is saved only in this browser. No background actions are running.
        </p>
      )}
      <SavedTaskView task={task} />
    </>
  );
}
