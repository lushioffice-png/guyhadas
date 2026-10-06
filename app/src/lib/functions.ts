import { auth } from "../firebase";

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

export interface Ga4SnapshotData {
  sessions: number;
  totalUsers: number;
  conversions: number;
  engagementRate: number;
  byChannel: { channel: string; sessions: number }[];
}

export async function syncGa4(businessId: string): Promise<Ga4SnapshotData> {
  const res = await callFunction<{ data: Ga4SnapshotData }>("visibilitySyncGa4", { businessId });
  return res.data;
}

export interface SearchConsoleSnapshotData {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  topQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
}

export async function syncSearchConsole(businessId: string): Promise<SearchConsoleSnapshotData> {
  const res = await callFunction<{ data: SearchConsoleSnapshotData }>("visibilitySyncSearchConsole", { businessId });
  return res.data;
}
