"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { getDeviceId, listLocalTasks, type LocalTask } from "@/lib/local-tasks";

function progressOf(task: LocalTask) {
  const total = task.result.nextActions.reduce(
    (sum, action) =>
      sum +
      (action.type === "checklist"
        ? action.content.split("\n").filter((line) => line.trim()).length
        : 0),
    0,
  );
  const done = Object.values(task.progress).filter(Boolean).length;
  return { total, done: Math.min(done, total) };
}

export function LocalTaskList() {
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [deviceId, setDeviceId] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDeviceId(getDeviceId());
      setTasks(listLocalTasks());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!deviceId)
    return (
      <div className="empty-state">
        <span className="spinner" /> LOADING TASKS…
      </div>
    );
  if (!tasks.length)
    return (
      <div className="empty-state">
        <span className="empty-orbit">✳</span>
        <span>NOTHING SAVED ON THIS DEVICE YET</span>
      </div>
    );

  const ongoing = tasks.filter((task) => {
    const p = progressOf(task);
    return p.total === 0 || p.done < p.total;
  });
  const done = tasks.filter((task) => {
    const p = progressOf(task);
    return p.total > 0 && p.done === p.total;
  });

  return (
    <div className="task-groups">
      <TaskGroup
        title="Ongoing"
        tasks={ongoing}
        deviceId={deviceId}
        onDelete={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
      />
      <TaskGroup
        title="Done"
        tasks={done}
        deviceId={deviceId}
        onDelete={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
      />
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  deviceId,
  onDelete,
}: {
  title: string;
  tasks: LocalTask[];
  deviceId: string;
  onDelete: (id: string) => void;
}) {
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
            const calendar = task.result.timeline.some((step) => step.datetime);
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
                  <DeleteTaskButton
                    taskId={task.id}
                    deviceId={deviceId}
                    backgroundStored={task.backgroundStored}
                    onDeleted={() => onDelete(task.id)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
