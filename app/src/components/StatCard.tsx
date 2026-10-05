interface StatCardProps {
  label: string;
  value: string | number;
  dim?: boolean; // for "not connected" / placeholder values
  delta?: { direction: "up" | "down" | "flat"; text: string };
}

export function StatCard({ label, value, dim, delta }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value${dim ? " dim" : ""}`}>{value}</div>
      {delta && (
        <div className={`stat-card-delta ${delta.direction}`}>
          {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "—"} {delta.text}
        </div>
      )}
    </div>
  );
}
