import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { AddTaskModal } from "../../components/AddTaskModal";
import { listenTasks, updateTask, deleteTask } from "../../lib/firestore";
import { TASK_STATUS_LABELS, PRIORITY_LABELS } from "../../types";
import type { Task, TaskStatus } from "../../types";
import type { BusinessContext } from "./BusinessWorkspace";

export default function BusinessTasks() {
  const { business } = useOutletContext<BusinessContext>();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!business) return;
    return listenTasks(business.id, setTasks);
  }, [business]);

  if (!business) return <div className="loading-row">טוען…</div>;

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    await updateTask(taskId, { status, completedAt: status === "completed" ? new Date() : null });
  }

  async function handleDelete(taskId: string, title: string) {
    if (confirm(`למחוק את המשימה "${title}"?`)) {
      await deleteTask(taskId);
    }
  }

  return (
    <div className="section-block">
      <div className="table-toolbar">
        <h2 className="section-title" style={{ marginBottom: 0 }}>משימות</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ משימה חדשה</button>
      </div>

      {tasks === null && <div className="loading-row">טוען…</div>}

      {tasks && tasks.length === 0 && (
        <EmptyState
          title="אין עדיין משימות"
          subtitle="משימות ייווצרו כאן ידנית כרגע, ובעתיד גם אוטומטית על ידי מנוע ההזדמנויות."
          action={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ משימה חדשה</button>}
        />
      )}

      {tasks && tasks.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>כותרת</th>
                <th>עדיפות</th>
                <th>אחראי</th>
                <th>תאריך יעד</th>
                <th>סטטוס</th>
                <th>מקור</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    {t.description && <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 2 }}>{t.description}</div>}
                  </td>
                  <td>{PRIORITY_LABELS[t.priority]}</td>
                  <td className="text-muted">{t.owner || "—"}</td>
                  <td className="text-muted">{t.dueDate || "—"}</td>
                  <td>
                    <select
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value as TaskStatus)}
                      style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 8px", fontSize: "0.8rem" }}
                    >
                      {Object.entries(TASK_STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.78rem" }}>{t.source || "manual"}</td>
                  <td>
                    <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(t.id, t.title)}>מחיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddTaskModal businessId={business.id} onClose={() => setShowAdd(false)} onCreated={() => setShowAdd(false)} />
      )}
    </div>
  );
}
