import { useState } from "react";
import { updateSearchTopicStatus } from "../../../lib/firestore";
import { TOPIC_STATUS_LABELS, DISCOVERY_SOURCE_LABELS } from "../../../types";
import type { SearchTopic, TopicStatus } from "../../../types";
import { Badge, type BadgeTone } from "../../../components/review/Badge";

const STATUS_BADGE: Record<TopicStatus, { tone: BadgeTone; icon: string }> = {
  new: { tone: "warn", icon: "!" },
  unsure: { tone: "warn", icon: "?" },
  relevant: { tone: "accent", icon: "✓" },
  priority: { tone: "accent", icon: "★" },
  brand_strategic: { tone: "info", icon: "◆" },
  exclude: { tone: "neutral", icon: "✕" }
};

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  const meta = STATUS_BADGE[status];
  return <Badge tone={meta.tone} icon={meta.icon}>{TOPIC_STATUS_LABELS[status]}</Badge>;
}

function TopicSourceBadge({ topic }: { topic: SearchTopic }) {
  if (topic.addedBy === "owner") {
    return <Badge tone="accent" icon="●" title="נוסף ידנית על ידי בעל/ת העסק.">בעל/ת העסק</Badge>;
  }
  return (
    <Badge tone="outline" title="מקור הנתונים שממנו הנושא התגלה.">
      {DISCOVERY_SOURCE_LABELS[topic.source]}
    </Badge>
  );
}

// A discovered search topic, in the same card language as the Service Map:
// status + source badges, compact metadata, expandable detail, and the
// primary review action first.
export function SearchTopicCard({ topic }: { topic: SearchTopic }) {
  const [showQueries, setShowQueries] = useState(false);
  const inReview = topic.status === "new" || topic.status === "unsure";
  const cardClass = inReview ? "needs-review" : topic.status === "exclude" ? "rejected" : "confirmed";
  const set = (status: TopicStatus) => updateSearchTopicStatus(topic.id, status);

  return (
    <article className={`record-card ${cardClass}`}>
      <div className="record-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h4 className="record-title" style={{ fontSize: "1rem" }}>{topic.title}</h4>
          <div className="record-badges">
            <TopicStatusBadge status={topic.status} />
            <TopicSourceBadge topic={topic} />
          </div>
        </div>
        <label className="inline-field-label">
          סטטוס
          <select className="select-quiet" value={topic.status} onChange={(e) => set(e.target.value as TopicStatus)}>
            {Object.entries(TOPIC_STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {topic.notes && <p className="record-desc">{topic.notes}</p>}

      {showQueries && (
        <ul className="evidence-list">
          {topic.queries.map((q) => (
            <li key={q} className="evidence-item" style={{ padding: "6px 12px" }}>{q}</li>
          ))}
        </ul>
      )}

      <div className="record-foot">
        <div className="record-actions">
          {inReview && (
            <>
              <button type="button" className="btn btn-confirm btn-sm" onClick={() => set("relevant")}>✓ רלוונטי</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => set("priority")}>★ עדיפות</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => set("exclude")}>החרגה</button>
            </>
          )}
        </div>
        {topic.queries.length > 0 ? (
          <button type="button" className="disclosure" aria-expanded={showQueries} onClick={() => setShowQueries((v) => !v)}>
            שאילתות ({topic.queries.length}) <span className="chev" aria-hidden="true">▾</span>
          </button>
        ) : (
          <span className="text-dim" style={{ fontSize: "0.8rem" }}>אין שאילתות</span>
        )}
      </div>
    </article>
  );
}
