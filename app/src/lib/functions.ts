import { auth } from "../firebase";
import type { Ga4SnapshotData, SearchConsoleSnapshotData } from "../types";

// Thin wrapper around the Visibility OS Cloud Functions (functions/visibility.js,
// Milestone 2+). Same deployment shape as the existing public-site functions
// (functions.https.onRequest, manual CORS, us-central1 - see public/*.js),
// but every one of these additionally requires a Firebase ID token, which
// the function verifies server-side against the admin allowlist.
const FUNCTIONS_BASE = "https://us-central1-guyhadas-e38c4.cloudfunctions.net";

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("לא מחובר");
  const idToken = await user.getIdToken();

  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok || json.success === false) {
    const message = typeof json.error === "string" ? json.error : `${name} נכשל (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

export interface Ga4PropertyOption {
  propertyId: string;
  displayName: string;
  accountName: string;
}

export interface SearchConsoleSiteOption {
  siteUrl: string;
  permissionLevel: string;
}

export async function listGa4Properties(): Promise<Ga4PropertyOption[]> {
  const res = await callFunction<{ properties: Ga4PropertyOption[] }>("visibilityListGa4Properties", {});
  return res.properties;
}

export async function listSearchConsoleSites(): Promise<SearchConsoleSiteOption[]> {
  const res = await callFunction<{ sites: SearchConsoleSiteOption[] }>("visibilityListSearchConsoleSites", {});
  return res.sites;
}

export function connectIntegration(
  businessId: string,
  provider: "ga4" | "search_console",
  propertyId: string,
  propertyLabel: string
): Promise<void> {
  return callFunction<void>("visibilityConnectIntegration", { businessId, provider, propertyId, propertyLabel });
}

export function disconnectIntegration(businessId: string, provider: "ga4" | "search_console"): Promise<void> {
  return callFunction<void>("visibilityDisconnectIntegration", { businessId, provider });
}

// Ga4SnapshotData / SearchConsoleSnapshotData live in types.ts - they're the
// same shape functions/visibility.js writes into trafficSnapshots/
// searchSnapshots, which the Traffic/Search tabs read back directly from
// Firestore (see lib/firestore.ts), so there's one definition, not two.

export async function syncGa4(businessId: string): Promise<Ga4SnapshotData> {
  const res = await callFunction<{ data: Ga4SnapshotData }>("visibilitySyncGa4", { businessId });
  return res.data;
}

export async function syncSearchConsole(businessId: string): Promise<SearchConsoleSnapshotData> {
  const res = await callFunction<{ data: SearchConsoleSnapshotData }>("visibilitySyncSearchConsole", { businessId });
  return res.data;
}

// --- Search Universe discovery (functions/searchUniverse.js) ---
// Each call runs Discovery + automatic Filtering + Normalization server-side
// and writes straight into searchTopics/keywords/competitors (see
// firestore.rules) - Owner Validation then happens as plain client writes
// to those same collections (see the search-topic functions below), not
// through another Cloud Function call.

export interface DiscoveryResult {
  discovered: number;
  topicsCreated: number;
  topicsMerged: number;
  excluded: number;
  refreshed: number;
  competitorsFound?: number;
  pagesScanned?: number;
}

export function discoverFromSearchConsole(businessId: string): Promise<DiscoveryResult> {
  return callFunction<DiscoveryResult>("visibilityDiscoverFromSearchConsole", { businessId });
}

export function discoverFromSemrush(businessId: string, seedPhrase: string, database?: string): Promise<DiscoveryResult> {
  return callFunction<DiscoveryResult>("visibilityDiscoverFromSemrush", { businessId, seedPhrase, database });
}

// --- Business & Service Discovery (functions/businessUnderstanding.js) ---
// Runs BEFORE search discovery in the corrected pipeline: seeds confirmed
// services from onboarding's services[] field (no AI, no cost), then - only
// if ANTHROPIC_API_KEY is configured - scrapes the business's website for
// evidence and asks Claude to propose additional services, landing as
// ownerStatus "needs_review" in businessServices (see lib/firestore.ts for
// the owner-validation writes: confirm/reject/edit/manual add).

export interface AnalyzeBusinessResult {
  ownerServicesSeeded: number;
  aiServicesProposed: number;
  aiServicesMerged: number;
  pagesScanned: number;
  aiAvailable: boolean;
  aiError: string | null;
}

export function analyzeBusiness(businessId: string): Promise<AnalyzeBusinessResult> {
  return callFunction<AnalyzeBusinessResult>("visibilityAnalyzeBusiness", { businessId });
}
