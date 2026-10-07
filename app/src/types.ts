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

// --- Search Universe & Qualification (roadmap Milestone 3) ---
// Discovery → Filtering → Normalization → Owner Validation → Approved
// Search Universe. See functions/searchUniverse.js for the discovery/
// filtering/normalization pipeline that writes these, and
// claude/visibility-os-search-universe-plan.md (project docs) for the
// reasoning behind this shape.

// "What the system knows/learns about the business" - distinct from
// `businesses`, which is "what the business is" (the static profile from
// Milestone 1). Owner-entered entries (exclusion_rule, strategic_priority,
// brand_terminology, business_rule) are source="owner", confidence=
// "observed" - a direct statement from the person who knows. System-entered
// entries (discovered_fact, learned_insight) aren't written by this
// milestone yet (that starts in M4/M9) but the shape supports them now so
// nothing needs to migrate later: confidence distinguishes a directly
// measured fact ("observed") from a system judgment/pattern ("inferred").
export type KnowledgeType =
  | "exclusion_rule"
  | "strategic_priority"
  | "brand_terminology"
  | "business_rule"
  | "discovered_fact"
  | "learned_insight";
export type KnowledgeSource = "owner" | "system";
export type KnowledgeConfidence = "observed" | "inferred";

export interface BusinessKnowledge {
  id: string;
  businessId: string;
  type: KnowledgeType;
  content: string;
  source: KnowledgeSource;
  confidence: KnowledgeConfidence;
  relatedTopicId?: string | null;
  createdAt: unknown;
  updatedAt: unknown;
}

// "new" is this app's own addition, not one of the roadmap's five owner
// decisions (Relevant / Priority / Brand-Strategic / Exclude / Unsure) -
// every discovered topic starts here until the owner (or, for an obvious
// exclusion-rule match, automatic filtering) moves it to one of those five.
export type TopicStatus = "new" | "relevant" | "priority" | "brand_strategic" | "exclude" | "unsure";
export type DiscoverySource = "semrush" | "gsc" | "website" | "competitor" | "manual";

export interface SearchTopic {
  id: string;
  businessId: string;
  title: string;
  queries: string[]; // underlying raw queries grouped into this topic - retained per spec 3.4
  status: TopicStatus;
  source: DiscoverySource;
  addedBy: "system" | "owner";
  notes?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

// One row per raw discovered phrase, independent of topic grouping - this
// is the provenance record spec 3.2 asks for ("preserve provenance for
// every discovery"). Not read back by the UI this milestone (a topic's own
// `queries` array is enough to display it) - exists for history/audit and
// for richer per-query data (volume/difficulty trends) later.
export interface Keyword {
  id: string;
  businessId: string;
  topicId: string | null;
  query: string;
  source: DiscoverySource;
  sourceProperty?: string | null;
  volume?: number | null;
  difficulty?: number | null;
  metrics?: { impressions?: number; clicks?: number; position?: number } | null;
  discoveredAt: unknown;
}

export interface Competitor {
  id: string;
  businessId: string;
  domain: string;
  discoveredVia: "semrush" | "manual";
  relevanceScore?: number | null;
  sharedKeywordCount?: number | null;
  addedAt: unknown;
}

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  new: "חדש",
  relevant: "רלוונטי",
  priority: "עדיפות",
  brand_strategic: "מותג / אסטרטגי",
  exclude: "הוחרג",
  unsure: "לא בטוח"
};

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  exclusion_rule: "כלל החרגה",
  strategic_priority: "עדיפות אסטרטגית",
  brand_terminology: "מינוח מותג",
  business_rule: "כלל עסקי",
  discovered_fact: "עובדה שהתגלתה",
  learned_insight: "תובנה שנלמדה"
};

export const DISCOVERY_SOURCE_LABELS: Record<DiscoverySource, string> = {
  semrush: "Semrush",
  gsc: "Search Console",
  website: "סריקת אתר (מושבת)",
  competitor: "מתחרה",
  manual: "ידני"
};

// --- Business & Service Discovery (roadmap Milestone 3.1) ---
// Inserted BEFORE Search Discovery in the corrected pipeline: Business
// Understanding -> Service Map -> (owner validation) -> Search Discovery
// seeds. See functions/businessUnderstanding.js for why this exists as its
// own collection rather than folding into businessKnowledge: a service is a
// structured, individually-validated unit (confirm/reject/edit/priority),
// not a freeform knowledge note.

export type ServiceSource = "owner" | "website" | "ai_inference" | "combined";
export type ServiceOwnerStatus = "confirmed" | "rejected" | "needs_review";

export interface BusinessService {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  source: ServiceSource;
  confidence: KnowledgeConfidence; // reuses "observed" | "inferred" from businessKnowledge
  ownerStatus: ServiceOwnerStatus;
  priority: TaskPriority;
  geographies: string[];
  evidence?: string[]; // short quotes/snippets backing an inferred service, for traceability
  // Milestone 3.1 refinement: per-quote source page, and whether the quote
  // was actually found in the scraped text (functions/serviceFacets.js).
  evidenceSources?: ServiceEvidence[];
  sourceUrls?: string[];
  // Structured interpretation underneath the human-readable `name` - the
  // separate dimensions M3.2 search discovery combines into seeds. Absent
  // on items created before this existed until the next analysis run.
  facets?: ServiceFacets;
  facetsVersion?: number;
  createdAt: unknown;
  updatedAt: unknown;
}

// owner = typed by the owner; website = value found verbatim in the
// scraped site text; ai_inference = AI interpretation not found verbatim.
export type FacetProvenance = "owner" | "website" | "ai_inference";

export interface FacetValue {
  value: string;
  provenance: FacetProvenance;
  sourceUrl: string | null;
  // Every crawled page the value appears on (absent on values stored
  // before page-level provenance was fixed).
  foundOn?: string[];
}

export type FacetDimension =
  | "services"
  | "projectTypes"
  | "audiences"
  | "markets"
  | "offerings"
  | "geographies"
  | "positioning"
  | "needs";

export type ServiceFacets = Partial<Record<FacetDimension, FacetValue[]>>;

export interface ServiceEvidence {
  quote: string;
  sourceUrl: string | null; // the page the quote came from - never rewritten
  verified: boolean; // found verbatim on that page in the crawl
  provenance?: "website" | "ai_inference"; // absent on evidence stored before 2026-10-07
  analysisInputHash?: string; // the analysis (cache identity) this evidence came from
}

export const FACET_DIMENSION_LABELS: Record<FacetDimension, string> = {
  services: "שירות",
  projectTypes: "סוג פרויקט",
  audiences: "קהל",
  markets: "שוק",
  offerings: "מודל שירות",
  geographies: "אזור",
  positioning: "מיצוב",
  needs: "צורך"
};

export const FACET_PROVENANCE_LABELS: Record<FacetProvenance, string> = {
  owner: "בעל/ת העסק",
  website: "מופיע באתר",
  ai_inference: "פרשנות AI"
};

export const SERVICE_SOURCE_LABELS: Record<ServiceSource, string> = {
  owner: "בעל/ת העסק",
  website: "אתר",
  ai_inference: "הסקת AI",
  combined: "בעל/ת העסק + AI"
};

export const SERVICE_OWNER_STATUS_LABELS: Record<ServiceOwnerStatus, string> = {
  confirmed: "מאושר",
  rejected: "נדחה",
  needs_review: "ממתין לבדיקה"
};

// What the website crawl actually did in one analysis run
// (functions/webUtils.js crawlSite + parsing in businessUnderstanding.js).
// Also stored permanently in the businessAnalysisRuns collection.
export interface CrawlReport {
  startUrl: string | null;
  siteHost: string | null;
  sitemap: string | null;
  pagesDiscovered: number;
  pagesSelected: number;
  pagesFetched: number;
  pagesParsed: number;
  discoveredVia: { homepageLinks: number; sitemap: number };
  parsedUrls: string[];
  failed: { url: string; reason: string }[];
  failedCount: number;
  skipped: { url: string; reason: string }[];
  skippedCount: number;
}

// What the cost-control layer decided for one analysis run
// (functions/apiUsage.js runGoverned), recorded on every run.
export type CacheDecision =
  | "cache_hit"
  | "cache_miss"
  | "forced_refresh"
  | "blocked_cache_unavailable"
  | "blocked_safety_check_unavailable"
  | "blocked_by_budget"
  | "blocked_by_quota"
  | "blocked_by_safety_limit"
  | "not_applicable";

export interface CostControlDecision {
  provider: string;
  analysisType: string;
  promptVersion: number;
  analysisVersion?: number;
  model: string | null;
  inputHash: string | null;
  cacheDecision: CacheDecision | null;
  cacheHit: boolean;
  forceRefresh: boolean;
  providerCalled: boolean;
  costUsd: number | null;
  cachedFromUsageId: string | null;
}

// One record per visibilityAnalyzeBusiness run (businessAnalysisRuns).
export interface BusinessAnalysisRun {
  id: string;
  businessId: string;
  kind: "service_map";
  completedAt: unknown;
  promptVersion: number;
  crawl: CrawlReport | null;
  ownerServicesSeeded: number;
  aiServicesProposed: number;
  aiServicesMerged: number;
  pagesScanned: number;
  aiAvailable: boolean;
  aiError: string | null;
  aiBlockedReason: string | null;
  aiCacheHit: boolean;
  aiCostUsd: number | null;
  costControl?: CostControlDecision; // absent on runs recorded before 2026-10-07 fix
  status?: "completed" | "blocked" | "ai_error";
}
