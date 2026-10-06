// GuyHadas Visibility OS - shared data model types.
// Collections are top-level in Firestore with a businessId field, not
// nested subcollections (see architecture assessment in the project docs).

export type BusinessStatus = "active" | "paused" | "onboarding";

export interface Business {
  id: string;
  businessNumber: number; // 1, 2, 3... purely a display label, not used in logic
  name: string;
  website?: string;
  industry?: string;
  description?: string;
  primaryMarket?: string;
  geographicMarkets?: string[];
  languages?: string[];
  targetAudience?: string;
  services?: string[];
  businessObjectives?: string;
  primaryConversionGoals?: string;
  status: BusinessStatus;
  createdAt: unknown; // Firestore Timestamp
  baselineDate?: string | null; // ISO date string, set when a baseline is created (Milestone 3)
}

export type IntegrationProvider = "ga4" | "search_console" | "semrush" | "openai" | "anthropic" | "xai" | "n8n";
export type IntegrationStatus = "connected" | "not_connected" | "auth_required" | "error";

export interface Integration {
  id: string;
  businessId: string | null; // null for account-level integrations (e.g. Semrush key itself)
  provider: IntegrationProvider;
  status: IntegrationStatus;
  propertyId?: string | null;
  propertyLabel?: string | null;
  lastSyncedAt?: unknown | null;
  errorMessage?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

export type TaskStatus = "todo" | "in_progress" | "waiting_for_human" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  businessId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  owner?: string;
  dueDate?: string | null; // ISO date
  source?: string; // e.g. "manual", later: "opportunity_engine", "ai_agent"
  opportunityId?: string | null;
  expectedOutcome?: string;
  createdAt: unknown;
  completedAt?: unknown | null;
}

export type OpportunityStatus =
  | "new"
  | "researching"
  | "approved"
  | "in_progress"
  | "completed"
  | "rejected"
  | "monitoring";

export interface Opportunity {
  id: string;
  businessId: string;
  title: string;
  query?: string;
  topic?: string;
  type?: string;
  description?: string;
  priority: TaskPriority;
  score?: number | null;
  status: OpportunityStatus;
  source?: string; // e.g. "manual", later: "opportunity_engine"
  relatedPage?: string;
  potentialValue?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "לביצוע",
  in_progress: "בתהליך",
  waiting_for_human: "ממתין לאדם",
  completed: "הושלם",
  cancelled: "בוטל"
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: "חדש",
  researching: "במחקר",
  approved: "אושר",
  in_progress: "בתהליך",
  completed: "הושלם",
  rejected: "נדחה",
  monitoring: "במעקב"
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה"
};

// --- Historical snapshots (Milestone 3) ---
// Written only by the visibilitySyncGa4 / visibilitySyncSearchConsole /
// visibilityDailySync Cloud Functions (functions/visibility.js) - this is
// the read-only shape the Traffic/Search tabs chart and compare against the
// business's baselineDate.

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface Ga4SnapshotData {
  sessions: number;
  totalUsers: number;
  conversions: number;
  engagementRate: number;
  byChannel: { channel: string; sessions: number }[];
}

export interface TrafficSnapshot {
  id: string;
  businessId: string;
  source: "ga4";
  sourceProperty: string;
  retrievedAt: unknown; // Firestore Timestamp
  dateRange: DateRange;
  data: Ga4SnapshotData;
}

export interface SearchConsoleSnapshotData {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

export interface SearchSnapshot {
  id: string;
  businessId: string;
  source: "search_console";
  sourceProperty: string;
  retrievedAt: unknown; // Firestore Timestamp
  dateRange: DateRange;
  data: SearchConsoleSnapshotData;
}

export const INTEGRATION_LABELS: Record<IntegrationProvider, string> = {
  ga4: "Google Analytics 4",
  search_console: "Google Search Console",
  semrush: "Semrush",
  openai: "OpenAI",
  anthropic: "Anthropic / Claude",
  xai: "xAI / Grok",
  n8n: "n8n"
};
