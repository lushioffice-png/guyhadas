// GuyHadas Visibility OS - Google Search Console adapter for M4
// (docs/MASTER.md §33 provider adapters). Thin: one request, normalized
// rows out. Callers MUST go through runGoverned (apiUsage.js) - this file
// never decides whether to call.

const { google } = require("googleapis");
const { getVisibilityAuth } = require("./visibility");

// Query x page performance rows for a date range.
async function fetchQueryPageRows(siteUrl, { startDate, endDate, rowLimit }) {
  const auth = getVisibilityAuth(["https://www.googleapis.com/auth/webmasters.readonly"]);
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { data } = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ["query", "page"], rowLimit, dataState: "final" }
  });
  return (data.rows || []).map((r) => ({
    query: r.keys?.[0] || "",
    page: r.keys?.[1] || "",
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0
  }));
}

module.exports = { fetchQueryPageRows };
