// GuyHadas Visibility OS - Milestone 2: Google data connections.
//
// Unlike the pre-existing calendar/email functions in index.js (which are
// only reachable by client code that already knows the right shape and are
// otherwise unauthenticated), every function here requires a verified
// Firebase ID token from the caller, checked against the same admin
// allowlist as firestore.rules' isAdmin() - per the spec's explicit
// requirement to keep Google credentials server-side with ID token
// validation on every backend call. Firestore rules additionally deny direct
// client writes to `integrations`/`trafficSnapshots`/`searchSnapshots`, so
// these functions (using the Admin SDK, which bypasses rules) are the only
// way those collections get written at all.
//
// Auth model: a single dedicated GCP service account (NOT the one the
// existing Calendar functions use), whose JSON key is stored as the
// `VISIBILITY_GOOGLE_SA_KEY` secret. Guy shares each business's GA4
// property and Search Console property with that service account's email
// (Viewer access) the same way he'd share a Google Doc - no OAuth consent
// screen, no refresh-token storage. See the Milestone 2 deliverable doc for
// the exact manual setup steps.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

// Same allowlist as firestore.rules' isAdmin() - duplicated here (not
// imported from firestore.rules, which isn't JS) because these functions
// enforce authorization themselves rather than relying on Firestore rules,
// which the Admin SDK bypasses entirely.
const ADMIN_EMAILS = ["mr.hadas@gmail.com"];

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Verifies the Firebase ID token on the Authorization header and checks the
// decoded email against ADMIN_EMAILS. On failure, writes the error response
// itself and returns null so callers can just `if (!user) return;`.
async function requireAdmin(req, res) {
  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ success: false, error: "Missing Authorization bearer token" });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email)) {
      res.status(403).json({ success: false, error: "Not authorized" });
      return null;
    }
    return decoded;
  } catch (err) {
    console.error("ID token verification failed:", err.message);
    res.status(401).json({ success: false, error: "Invalid or expired token" });
    return null;
  }
}

// Builds a GoogleAuth client from the dedicated Visibility OS service
// account key (Secret Manager), not the ambient Application Default
// Credentials the Calendar functions use - a deliberate separate identity.
function getVisibilityAuth(scopes) {
  const keyJson = process.env.VISIBILITY_GOOGLE_SA_KEY;
  if (!keyJson) {
    throw new Error("VISIBILITY_GOOGLE_SA_KEY is not set - see the Milestone 2 setup steps");
  }
  let credentials;
  try {
    credentials = JSON.parse(keyJson);
  } catch (err) {
    throw new Error("VISIBILITY_GOOGLE_SA_KEY is not valid JSON");
  }
  return new google.auth.GoogleAuth({ credentials, scopes });
}

async function markIntegrationError(businessId, provider, message) {
  try {
    await admin.firestore().collection("integrations").doc(`${businessId}_${provider}`).set(
      { status: "error", errorMessage: message },
      { merge: true }
    );
  } catch (err) {
    console.error("Failed to record integration error state:", err.message);
  }
}

// --- Discovery: which properties can the service account see? ---
// Used to populate the "pick a property" step after Guy has shared a
// specific GA4/Search Console property with the service account's email.

exports.visibilityListGa4Properties = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    try {
      const auth = getVisibilityAuth(["https://www.googleapis.com/auth/analytics.readonly"]);
      const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth });
      const { data } = await analyticsAdmin.accountSummaries.list({ pageSize: 200 });

      const properties = [];
      for (const account of data.accountSummaries || []) {
        for (const prop of account.propertySummaries || []) {
          properties.push({
            propertyId: prop.property, // "properties/123456"
            displayName: prop.displayName,
            accountName: account.displayName
          });
        }
      }
      res.status(200).json({ success: true, properties });
    } catch (err) {
      console.error("visibilityListGa4Properties error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

exports.visibilityListSearchConsoleSites = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    try {
      const auth = getVisibilityAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
      const searchconsole = google.searchconsole({ version: "v1", auth });
      const { data } = await searchconsole.sites.list();
      const sites = (data.siteEntry || []).map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel
      }));
      res.status(200).json({ success: true, sites });
    } catch (err) {
      console.error("visibilityListSearchConsoleSites error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

// --- Connect / disconnect: record which property a business is using ---
// Pure Firestore bookkeeping, no Google API call - the frontend calls
// syncGa4/syncSearchConsole right after this succeeds to pull real data.

exports.visibilityConnectIntegration = functions.https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { businessId, provider, propertyId, propertyLabel } = req.body || {};
    if (!businessId || !provider || !propertyId) {
      res.status(400).json({ success: false, error: "businessId, provider and propertyId are required" });
      return;
    }
    if (!["ga4", "search_console"].includes(provider)) {
      res.status(400).json({ success: false, error: "Unsupported provider for this endpoint" });
      return;
    }

    const db = admin.firestore();
    const docRef = db.collection("integrations").doc(`${businessId}_${provider}`);
    const existing = await docRef.get();
    const now = admin.firestore.FieldValue.serverTimestamp();

    await docRef.set(
      {
        businessId,
        provider,
        propertyId,
        propertyLabel: propertyLabel || propertyId,
        status: "connected",
        errorMessage: null,
        lastSyncedAt: existing.exists ? existing.data().lastSyncedAt || null : null,
        createdAt: existing.exists ? existing.data().createdAt || now : now,
        updatedAt: now
      },
      { merge: false }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("visibilityConnectIntegration error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

exports.visibilityDisconnectIntegration = functions.https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const { businessId, provider } = req.body || {};
    if (!businessId || !provider) {
      res.status(400).json({ success: false, error: "businessId and provider are required" });
      return;
    }
    await admin.firestore().collection("integrations").doc(`${businessId}_${provider}`).set(
      {
        status: "not_connected",
        propertyId: null,
        propertyLabel: null,
        errorMessage: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("visibilityDisconnectIntegration error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Ingestion: pull current data and store a normalized snapshot ---
// Milestone 2 scope is "real ingestion, normalized storage" for the current
// period only. Historical backfill, baseline-setting and date-range
// comparisons are Milestone 3 - these snapshots are exactly the provenance
// shape that work will build on (businessId, source, sourceProperty,
// retrievedAt, dateRange, data).

exports.visibilitySyncGa4 = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { businessId } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }

    try {
      const db = admin.firestore();
      const integDoc = await db.collection("integrations").doc(`${businessId}_ga4`).get();
      if (!integDoc.exists || integDoc.data().status === "not_connected") {
        res.status(400).json({ success: false, error: "GA4 is not connected for this business" });
        return;
      }
      const { propertyId } = integDoc.data();

      const auth = getVisibilityAuth(["https://www.googleapis.com/auth/analytics.readonly"]);
      const analyticsData = google.analyticsdata({ version: "v1beta", auth });
      const dateRange = { startDate: "28daysAgo", endDate: "today" };

      const { data } = await analyticsData.properties.runReport({
        property: propertyId,
        requestBody: {
          dateRanges: [dateRange],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "conversions" },
            { name: "engagementRate" }
          ],
          dimensions: [{ name: "sessionDefaultChannelGroup" }]
        }
      });

      let sessions = 0;
      let totalUsers = 0;
      let conversions = 0;
      let engagementWeighted = 0;
      const byChannel = [];

      for (const row of data.rows || []) {
        const channel = row.dimensionValues?.[0]?.value || "(unknown)";
        const rowSessions = Number(row.metricValues?.[0]?.value || 0);
        const rowUsers = Number(row.metricValues?.[1]?.value || 0);
        const rowConversions = Number(row.metricValues?.[2]?.value || 0);
        const rowEngagement = Number(row.metricValues?.[3]?.value || 0);
        sessions += rowSessions;
        totalUsers += rowUsers;
        conversions += rowConversions;
        engagementWeighted += rowEngagement * rowSessions;
        byChannel.push({ channel, sessions: rowSessions });
      }
      byChannel.sort((a, b) => b.sessions - a.sessions);

      const snapshotData = {
        sessions,
        totalUsers,
        conversions,
        engagementRate: sessions > 0 ? engagementWeighted / sessions : 0,
        byChannel: byChannel.slice(0, 10)
      };
      const retrievedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection("trafficSnapshots").add({
        businessId,
        source: "ga4",
        sourceProperty: propertyId,
        retrievedAt,
        dateRange,
        data: snapshotData
      });
      await db.collection("integrations").doc(`${businessId}_ga4`).set(
        { lastSyncedAt: retrievedAt, status: "connected", errorMessage: null },
        { merge: true }
      );

      res.status(200).json({ success: true, data: snapshotData });
    } catch (err) {
      console.error("visibilitySyncGa4 error:", err.message);
      await markIntegrationError(businessId, "ga4", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

exports.visibilitySyncSearchConsole = functions
  .runWith({ secrets: ["VISIBILITY_GOOGLE_SA_KEY"] })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { businessId } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }

    try {
      const db = admin.firestore();
      const integDoc = await db.collection("integrations").doc(`${businessId}_search_console`).get();
      if (!integDoc.exists || integDoc.data().status === "not_connected") {
        res.status(400).json({ success: false, error: "Search Console is not connected for this business" });
        return;
      }
      const { propertyId } = integDoc.data();

      const auth = getVisibilityAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
      const searchconsole = google.searchconsole({ version: "v1", auth });

      const end = new Date();
      const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
      const dateRange = {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10)
      };

      const [totalsRes, queriesRes] = await Promise.all([
        searchconsole.searchanalytics.query({
          siteUrl: propertyId,
          requestBody: { startDate: dateRange.startDate, endDate: dateRange.endDate }
        }),
        searchconsole.searchanalytics.query({
          siteUrl: propertyId,
          requestBody: {
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dimensions: ["query"],
            rowLimit: 20
          }
        })
      ]);

      const totalsRow = totalsRes.data.rows?.[0] || {};
      const topQueries = (queriesRes.data.rows || []).map((r) => ({
        query: r.keys?.[0] || "",
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr || 0,
        position: r.position || 0
      }));

      const snapshotData = {
        clicks: totalsRow.clicks || 0,
        impressions: totalsRow.impressions || 0,
        ctr: totalsRow.ctr || 0,
        avgPosition: totalsRow.position || 0,
        topQueries
      };
      const retrievedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection("searchSnapshots").add({
        businessId,
        source: "search_console",
        sourceProperty: propertyId,
        retrievedAt,
        dateRange,
        data: snapshotData
      });
      await db.collection("integrations").doc(`${businessId}_search_console`).set(
        { lastSyncedAt: retrievedAt, status: "connected", errorMessage: null },
        { merge: true }
      );

      res.status(200).json({ success: true, data: snapshotData });
    } catch (err) {
      console.error("visibilitySyncSearchConsole error:", err.message);
      await markIntegrationError(businessId, "search_console", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
