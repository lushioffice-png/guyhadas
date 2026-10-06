import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { createTask } from "../lib/firestore";
import type { Task, TaskPriority } from "../types";

interface AddTaskModalProps {
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function AddTaskModal({ businessId, onClose, onCreated }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const data: Omit<Task, "id" | "createdAt" | "completedAt"> = {
        businessId,
        title: title.trim(),
        description: description.trim() || undefined,
        status: "todo",
        priority,
        owner: owner.trim() || undefined,
        dueDate: dueDate || null,
        source: "manual",
        opportunityId: null,
        expectedOutcome: expectedOutcome.trim() || undefined
      };
      await createTask(data);
      onCreated();
    } catch (err) {
      console.error("Error creating task:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="משימה חדשה" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="task-title">כותרת *</label>
          <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-field">
          <label htmlFor="task-desc">תיאור</label>
          <textarea id="task-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="task-priority">עדיפות</label>
            <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">נמוכה</option>
              <option value="medium">בינונית</option>
              <option value="high">גבוהה</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="task-due">תאריך יעד</label>
            <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="task-owner">אחראי</label>
          <input id="task-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="task-outcome">תוצאה מצופה</label>
          <input id="task-outcome" value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "שומר…" : "יצירת משימה"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  );
}
