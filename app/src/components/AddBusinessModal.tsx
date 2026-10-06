import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { createBusiness } from "../lib/firestore";
import type { Business, BusinessStatus } from "../types";

interface AddBusinessModalProps {
  nextBusinessNumber: number;
  onClose: () => void;
  onCreated: () => void;
}

export function AddBusinessModal({ nextBusinessNumber, onClose, onCreated }: AddBusinessModalProps) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [primaryMarket, setPrimaryMarket] = useState("");
  const [geographicMarkets, setGeographicMarkets] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [services, setServices] = useState("");
  const [businessObjectives, setBusinessObjectives] = useState("");
  const [primaryConversionGoals, setPrimaryConversionGoals] = useState("");
  const [status, setStatus] = useState<BusinessStatus>("onboarding");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const data: Omit<Business, "id" | "createdAt"> = {
        businessNumber: nextBusinessNumber,
        name: name.trim(),
        website: website.trim() || undefined,
        industry: industry.trim() || undefined,
        description: description.trim() || undefined,
        primaryMarket: primaryMarket.trim() || undefined,
        geographicMarkets: geographicMarkets
          ? geographicMarkets.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        languages: undefined,
        targetAudience: targetAudience.trim() || undefined,
        services: services ? services.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        businessObjectives: businessObjectives.trim() || undefined,
        primaryConversionGoals: primaryConversionGoals.trim() || undefined,
        status,
        baselineDate: null
      };
      await createBusiness(data);
      onCreated();
    } catch (err) {
      console.error("Error creating business:", err);
      setError("שגיאה ביצירת העסק. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`עסק חדש — Business ${String(nextBusinessNumber).padStart(3, "0")}`} onClose={onClose}>
      {error && <div className="login-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="biz-name">שם העסק *</label>
          <input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="biz-website">אתר</label>
            <input id="biz-website" dir="ltr" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="form-field">
            <label htmlFor="biz-industry">תחום</label>
            <input id="biz-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="biz-desc">תיאור</label>
          <textarea id="biz-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="biz-market">שוק עיקרי</label>
            <input id="biz-market" value={primaryMarket} onChange={(e) => setPrimaryMarket(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="biz-geo">אזורים גיאוגרפיים (מופרד בפסיקים)</label>
            <input id="biz-geo" value={geographicMarkets} onChange={(e) => setGeographicMarkets(e.target.value)} />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="biz-audience">קהל יעד</label>
          <input id="biz-audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="biz-services">שירותים (מופרד בפסיקים)</label>
          <input id="biz-services" value={services} onChange={(e) => setServices(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="biz-objectives">יעדים עסקיים</label>
          <textarea id="biz-objectives" rows={2} value={businessObjectives} onChange={(e) => setBusinessObjectives(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="biz-goals">יעדי המרה עיקריים</label>
          <input id="biz-goals" value={primaryConversionGoals} onChange={(e) => setPrimaryConversionGoals(e.target.value)} />
        </div>

        <div className="form-field">
          <label htmlFor="biz-status">סטטוס</label>
          <select id="biz-status" value={status} onChange={(e) => setStatus(e.target.value as BusinessStatus)}>
            <option value="onboarding">בהקמה</option>
            <option value="active">פעיל</option>
            <option value="paused">מושהה</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "שומר…" : "יצירת עסק"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
        </div>
      </form>
    </Modal>
  );
}
