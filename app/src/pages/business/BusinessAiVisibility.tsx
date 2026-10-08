import { Link } from "react-router-dom";

// נראות AI - external AI-visibility monitoring is a later milestone. Until
// then, point to what exists today: the website's own GEO readiness.
export default function BusinessAiVisibility() {
  return (
    <div className="section-block">
      <h2 className="page-title">נראות AI</h2>
      <div className="panel" style={{ marginTop: "var(--space-4)" }}>
        <div className="panel-title">מעקב אחרי הופעה בתשובות של מערכות AI - בקרוב</div>
        <p className="panel-meta">
          בהמשך המערכת תבדוק אם העסק מופיע בתשובות של ChatGPT, Gemini, Perplexity ומערכות דומות, ואיך הן מתארות אותו. זה עדיין לא נמדד.
        </p>
        <p className="panel-meta">כבר עכשיו אפשר לראות עד כמה האתר מציג את העסק בצורה ברורה ועקבית - הבסיס להופעה טובה במערכות האלה.</p>
        <Link className="btn btn-outline" to="../intelligence?tab=geo">לבדיקת בהירות העסק באתר (GEO)</Link>
      </div>
    </div>
  );
}
