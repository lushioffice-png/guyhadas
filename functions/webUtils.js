// GuyHadas Visibility OS - shared website-fetching helpers. Used by
// functions/businessUnderstanding.js to gather evidence for business/service
// understanding, and by functions/searchUniverse.js (extractDomain only) to
// resolve a business's domain for Semrush calls.
//
// Website evidence is foundational data (Service Map now, Search Universe /
// SEO / GEO later), so the crawl is explicit about what it did: every run
// returns a report of what was discovered, fetched, skipped and why. See
// the permanent provenance rule in the project docs
// (claude/visibility-os-website-evidence-provenance-rule.md).
//
// History: the first version only read `${origin}/sitemap.xml`, with
// origin built from the domain with "www." stripped, and fell back to the
// homepage alone when that produced nothing. For a site whose sitemap is an
// index (Wix, WordPress/Yoast) on the www host - e.g. hagarlushi.com - that
// meant only the homepage was ever analyzed. crawlSite below fixes that:
// host matching ignores "www.", sitemap indexes are followed, and the
// homepage's own internal links are used too (they also give priority -
// pages the site links from its homepage are the ones it considers
// important).

const MAX_PAGES = 15; // pages actually fetched for evidence per run
const MAX_CHILD_SITEMAPS = 5;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 5;
const USER_AGENT = "GuyHadasVisibilityOS/1.0 (+https://guyhadas.xyz)";

// Pages that never describe what a business sells. Skipped with a recorded
// reason rather than silently dropped.
const UTILITY_PAGE_PATTERNS = [
  /thank-?you/i,
  /coming-?soon/i,
  /\/copy-of-/i,
  /\/404\b/,
  /privacy|terms|cookie/i,
  /accessibility|נגישות/i,
  /\/(cart|checkout|account|login|signup|search)\b/i,
  /\/blank(-\d+)?$/i
];
const NON_HTML_EXTENSIONS = /\.(pdf|jpe?g|png|gif|webp|svg|mp4|mov|zip|docx?|xlsx?|xml)$/i;

function extractDomain(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    return new URL(withProtocol).hostname.replace(/^www\./, "");
  } catch (err) {
    return null;
  }
}

function bareHost(hostname) {
  return (hostname || "").toLowerCase().replace(/^www\./, "");
}

// Readable, stable form of a URL: no hash/query, no trailing slash (except
// root), and the path decoded so Hebrew slugs stay readable. It is the same
// address, just not percent-encoded - this is the URL stored as evidence.
function canonicalUrl(raw, base) {
  let u;
  try {
    u = new URL(raw, base);
  } catch (err) {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.search = "";
  let href = u.href;
  try {
    href = decodeURI(href);
  } catch (err) {
    // keep encoded form if it doesn't decode cleanly
  }
  if (href.endsWith("/") && u.pathname !== "/") href = href.slice(0, -1);
  return href;
}

// Dedupe key: the same page reached via www/non-www or with/without a
// trailing slash is one page.
function pageKey(url) {
  try {
    const u = new URL(url);
    return `${bareHost(u.hostname)}${u.pathname.replace(/\/$/, "") || "/"}`;
  } catch (err) {
    return url;
  }
}

// Like fetchWithTimeout, but says why it failed - the crawl report needs
// the reason, not just "null".
async function fetchPage(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return { ok: false, status: res.status, html: null, finalUrl: res.url, error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") || "";
    const xRobotsTag = res.headers.get("x-robots-tag") || null;
    const html = await res.text();
    return { ok: true, status: res.status, html, finalUrl: res.url || url, contentType, xRobotsTag, error: null };
  } catch (err) {
    return { ok: false, status: null, html: null, finalUrl: url, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const r = await fetchPage(url, timeoutMs);
  return r.ok ? r.html : null;
}

// Page URLs from a sitemap, following one level of sitemap index.
async function readSitemapPages(origin, cheerio, isSameSite) {
  const out = [];
  const root = await fetchPage(`${origin}/sitemap.xml`);
  if (!root.ok) return { pages: out, note: `sitemap.xml: ${root.error}` };
  let $ = cheerio.load(root.html, { xmlMode: true });
  if ($("sitemapindex").length > 0) {
    const children = $("sitemap > loc")
      .map((_, el) => $(el).text().trim())
      .get()
      // Page sitemaps first (they hold the site's real pages), then the rest.
      .sort((a, b) => (/page/i.test(b) ? 1 : 0) - (/page/i.test(a) ? 1 : 0))
      .slice(0, MAX_CHILD_SITEMAPS);
    for (const childUrl of children) {
      const child = await fetchPage(childUrl);
      if (!child.ok) continue;
      $ = cheerio.load(child.html, { xmlMode: true });
      $("url > loc").each((_, el) => out.push($(el).text().trim()));
    }
    return { pages: out.filter(isSameSite), note: `sitemap index, ${children.length} child sitemaps read` };
  }
  $("url > loc").each((_, el) => out.push($(el).text().trim()));
  return { pages: out.filter(isSameSite), note: "sitemap urlset" };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Discover, select and fetch a business website's pages for evidence.
// Returns { pages: [{ url, html }], report } - `report` is the crawl/debug
// summary (what was discovered, fetched, failed and skipped, with reasons).
// Parsing (did a fetched page actually contain text) is the caller's job,
// since it owns the extraction rules.
async function crawlSite(websiteUrl, cheerio, maxPages = MAX_PAGES) {
  const report = {
    startUrl: null,
    siteHost: null,
    sitemap: null,
    pagesDiscovered: 0,
    pagesSelected: 0,
    pagesFetched: 0,
    discoveredVia: { homepageLinks: 0, sitemap: 0 },
    failed: [], // [{ url, reason }]
    skipped: [] // [{ url, reason }]
  };
  const startUrl = canonicalUrl(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
  report.startUrl = startUrl;
  if (!startUrl) return { pages: [], report, sitemapPageKeys: [], origin: null, sitemapRead: false };

  const home = await fetchPage(startUrl);
  if (!home.ok) {
    report.failed.push({ url: startUrl, reason: home.error });
    return { pages: [], report, sitemapPageKeys: [], origin: null, sitemapRead: false };
  }
  // Follow the site's own redirect (e.g. hagarlushi.com -> www.hagarlushi.com)
  // so every later URL is built on the host the site actually serves.
  const homeUrl = canonicalUrl(home.finalUrl || startUrl);
  const origin = new URL(homeUrl).origin;
  const siteHost = bareHost(new URL(homeUrl).hostname);
  report.siteHost = siteHost;
  const isSameSite = (u) => {
    try {
      return bareHost(new URL(u).hostname) === siteHost;
    } catch (err) {
      return false;
    }
  };

  // Candidates in priority order: homepage, then pages the homepage links
  // to (in the order it links them), then sitemap-only pages.
  const candidates = [{ url: homeUrl, via: "homepage" }];
  const $home = cheerio.load(home.html);
  $home("a[href]").each((_, el) => {
    const url = canonicalUrl($home(el).attr("href"), homeUrl);
    if (url && isSameSite(url)) candidates.push({ url, via: "homepageLink" });
  });
  const sitemap = await readSitemapPages(origin, cheerio, isSameSite);
  report.sitemap = sitemap.note;
  // M4: which pages the sitemap lists (pageKey form), for sitemap membership.
  const sitemapPageKeys = sitemap.pages.map((raw) => canonicalUrl(raw)).filter(Boolean).map(pageKey);
  for (const raw of sitemap.pages) {
    const url = canonicalUrl(raw);
    if (url) candidates.push({ url, via: "sitemap" });
  }

  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = pageKey(c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (c.via === "homepageLink") report.discoveredVia.homepageLinks++;
    if (c.via === "sitemap") report.discoveredVia.sitemap++;
  }
  report.pagesDiscovered = unique.length;

  const selected = [];
  for (const c of unique) {
    if (c.via !== "homepage" && NON_HTML_EXTENSIONS.test(new URL(c.url).pathname)) {
      report.skipped.push({ url: c.url, reason: "not an HTML page" });
    } else if (c.via !== "homepage" && UTILITY_PAGE_PATTERNS.some((re) => re.test(c.url))) {
      report.skipped.push({ url: c.url, reason: "utility page" });
    } else if (selected.length >= maxPages) {
      report.skipped.push({ url: c.url, reason: `over page limit (${maxPages})` });
    } else {
      selected.push(c);
    }
  }
  report.pagesSelected = selected.length;

  const fetched = await mapWithConcurrency(selected, FETCH_CONCURRENCY, async (c) => {
    if (c.via === "homepage") return { url: c.url, result: home };
    return { url: c.url, result: await fetchPage(c.url) };
  });

  const pages = [];
  for (const { url, result } of fetched) {
    if (!result.ok) {
      report.failed.push({ url, reason: result.error });
      continue;
    }
    if (result.contentType && !/html/i.test(result.contentType)) {
      report.failed.push({ url, reason: `not HTML (${result.contentType})` });
      continue;
    }
    // status/finalUrl/xRobotsTag are additive (M4 page inventory); M3.1
    // callers only read url + html.
    pages.push({ url, html: result.html, status: result.status, finalUrl: result.finalUrl ? canonicalUrl(result.finalUrl) : url, xRobotsTag: result.xRobotsTag || null });
  }
  report.pagesFetched = pages.length;
  return { pages, report, sitemapPageKeys, origin, sitemapRead: !/^sitemap\.xml: /.test(report.sitemap || "") };
}

module.exports = {
  extractDomain,
  fetchWithTimeout,
  fetchPage,
  crawlSite,
  canonicalUrl,
  pageKey,
  bareHost,
  MAX_PAGES,
  FETCH_TIMEOUT_MS
};
