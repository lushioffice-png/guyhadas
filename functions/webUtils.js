// GuyHadas Visibility OS - shared website-fetching helpers. Used by
// functions/businessUnderstanding.js to gather evidence for business/service
// understanding, and by functions/searchUniverse.js (extractDomain only) to
// resolve a business's domain for Semrush calls.
//
// Previously functions/searchUniverse.js had its own copy of these to feed
// visibilityDiscoverFromWebsite (raw page text -> Search Topics directly).
// That function has been retired per the corrected architecture: scraping a
// marketing/design website's own words and treating them as the search
// universe produced noise, not real search demand. The fetching mechanics
// below are still useful - they're just evidence-gathering for
// visibilityAnalyzeBusiness now, not a discovery source in their own right.

const MAX_PAGES = 8;
const FETCH_TIMEOUT_MS = 8000;

function extractDomain(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch (err) {
    return null;
  }
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GuyHadasVisibilityOS/1.0 (+https://guyhadas.xyz)" }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Requires the caller's own `cheerio` require (not re-exported here) to
// avoid this module needing a direct dependency just for sitemap parsing -
// callers already depend on cheerio themselves.
async function discoverSitePages(origin, cheerio, maxPages = MAX_PAGES) {
  const sitemapXml = await fetchWithTimeout(`${origin}/sitemap.xml`);
  if (sitemapXml) {
    const $ = cheerio.load(sitemapXml, { xmlMode: true });
    const locs = $("loc")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((u) => u.startsWith(origin));
    if (locs.length > 0) return locs.slice(0, maxPages);
  }
  return [origin]; // fallback: homepage only
}

module.exports = { extractDomain, fetchWithTimeout, discoverSitePages, MAX_PAGES, FETCH_TIMEOUT_MS };
