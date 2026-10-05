import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { createOpportunity } from "../lib/firestore";
import type { Opportunity, TaskPriority } from "../types";

interface AddOpportunityModalProps {
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function AddOpportunityModal({ businessId, onClose, onCreated }: AddOpportunityModalProps) {
  const [title, setTitle] = useState("");
  const [queryText, setQueryText] = useState("");
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [relatedPage, setRelatedPage] = useState("");
  const [potentialValue, setPotentialValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const data: Omit<Opportunity, "id" | "createdAt" | "updatedAt"> = {
        businessId,
        title: title.trim(),
        query: queryText.trim() || undefined,
        topic: topic.trim() || undefined,
        type: type.trim() || undefined,
        description: description.trim() || undefined,
        priority,
        score: null,
        status: "new",
        source: "manual",
        relatedPage: relatedPage.trim() || undefined,
        potentialValue: potentialValue.trim() || undefined
      };
      await createOpportunity(data);
      onCreated();
    } catch (err) {
      console.error("Error creating opportunity:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="הזדמנות חדשה" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="opp-title">כותרת *</label>
          <input id="opp-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="opp-query">מילת חיפוש</label>
            <input id="opp-query" value={queryText} onChange={(e) => setQueryText(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="opp-topic">נושא</label>
            <input id="opp-topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="opp-type">סוג</label>
            <input id="opp-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="תוכן / טכני / קישורים..." />
          </div>
          <div className="form-field">
            <label htmlFor="opp-priority">עדיפות</label>
            <select id="opp-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              <option value="low">נמוכה</option>
              <option value="medium">בינונית</option>
              <option value="high">גבוהה</option>
            </select>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="opp-desc">תיאור</label>
          <textarea id="opp-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="opp-page">עמוד רלוונטי</label>
            <input id="opp-page" dir="ltr" value={relatedPage} onChange={(e) => setRelatedPage(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="opp-value">ערך פוטנציאלי</label>
            <input id="opp-value" value={potentialValue} onChange={(e) => setPotentialValue(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "שומר…" : "יצירת הזדמנות"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  );
}
