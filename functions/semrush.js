// GuyHadas Visibility OS - Semrush adapter (roadmap Milestone 3, Search
// Discovery). Talks to Semrush's classic Analytics API directly over HTTPS
// - NOT the Claude-session Semrush MCP connector used earlier in planning,
// which has no bearing on this production backend or its own API key.
//
// Kept deliberately thin: three functions, one per report this milestone
// actually needs, each mapping Semrush's CSV response into plain objects.
// Real, verified against https://developer.semrush.com (API base URL,
// report `type` values, `export_columns` codes, semicolon-delimited CSV
// response, and the per-line unit costs quoted in the Milestone 3 Search
// Universe deliverable doc) - not guessed.
//
// Gating: every exported fetch function throws if SEMRUSH_API_KEY isn't
// set. isSemrushConfigured() lets the Cloud Function return a clean
// "not configured" error instead of a confusing stack trace. Once a real
// key with API units is stored in the secret, this file needs no changes -
// only functions/index.js's gating check needs the secret to exist.

const SEMRUSH_BASE_URL = "https://api.semrush.com/";

// A placeholder secret (deploys need SEMRUSH_API_KEY to exist before a real
// key is bought) counts as "not configured", so no doomed request is made.
function isSemrushConfigured() {
  const key = (process.env.SEMRUSH_API_KEY || "").trim();
  if (key.length < 20) return false;
  return !/not[-_ ]?(yet|configured)|placeholder|changeme|dummy/i.test(key);
}

function getSemrushApiKey() {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) {
    throw new Error("SEMRUSH_API_KEY is not set - Semrush discovery is not configured yet");
  }
  return key;
}

// Semrush's classic API returns semicolon-delimited CSV with a header row
// (verified - this is NOT comma-delimited, a common mix-up with this API).
function parseSemicolonCsv(text) {
  const lines = text.trim().split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(";").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(";");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] !== undefined ? cells[i].trim() : "";
    });
    return row;
  });
}

async function semrushRequest(params) {
  const key = getSemrushApiKey();
  const url = new URL(SEMRUSH_BASE_URL);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const text = await res.text();
  // Semrush returns HTTP 200 with an "ERROR ..." body for most API-level
  // failures (bad key, no units, bad domain), not a non-2xx status code.
  if (!res.ok || /^ERROR/i.test(text.trim())) {
    throw new Error(`Semrush API error: ${text.slice(0, 300)}`);
  }
  return parseSemicolonCsv(text);
}

// Related Keywords - type=phrase_related, 40 API units/line (current data).
// The core "expand a seed term into candidate topics" report for 3.2.
async function fetchRelatedKeywords(seedPhrase, database, limit = 30) {
  const rows = await semrushRequest({
    type: "phrase_related",
    phrase: seedPhrase,
    database,
    export_columns: "Ph,Nq,Co,Kd",
    display_limit: String(limit)
  });
  return rows.map((r) => ({
    query: r.Ph,
    volume: r.Nq ? Number(r.Nq) : null,
    competition: r.Co ? Number(r.Co) : null,
    difficulty: r.Kd ? Number(r.Kd) : null
  }));
}

// Domain Organic Search Keywords - type=domain_organic, 10 API units/line
// (current data). What the business's own domain already ranks for.
async function fetchDomainOrganicKeywords(domain, database, limit = 50) {
  const rows = await semrushRequest({
    type: "domain_organic",
    domain,
    database,
    export_columns: "Ph,Po,Nq,Kd,Ur",
    display_limit: String(limit)
  });
  return rows.map((r) => ({
    query: r.Ph,
    position: r.Po ? Number(r.Po) : null,
    volume: r.Nq ? Number(r.Nq) : null,
    difficulty: r.Kd ? Number(r.Kd) : null,
    url: r.Ur || null
  }));
}

// Domain Organic Competitors - type=domain_organic_organic, 40 API
// units/line (current data). Finds likely competitor domains automatically
// via shared keyword overlap - useful since this business has none named.
async function fetchOrganicCompetitors(domain, database, limit = 10) {
  const rows = await semrushRequest({
    type: "domain_organic_organic",
    domain,
    database,
    export_columns: "Dn,Cr,Np,Or",
    display_limit: String(limit)
  });
  return rows.map((r) => ({
    domain: r.Dn,
    relevance: r.Cr ? Number(r.Cr) : null,
    commonKeywords: r.Np ? Number(r.Np) : null,
    organicKeywords: r.Or ? Number(r.Or) : null
  }));
}

module.exports = {
  isSemrushConfigured,
  fetchRelatedKeywords,
  fetchDomainOrganicKeywords,
  fetchOrganicCompetitors
};
