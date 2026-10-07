// GuyHadas Visibility OS - semantic structure ("facets") for Service Map
// items (Milestone 3.1 refinement).
//
// A discovered item like "עיצוב דירות יוקרה" is not just a service name - it
// combines a core service (interior design), a project type (luxury
// apartments) and a positioning qualifier (luxury). Flattening it into one
// string loses the dimensions M3.2 Search Discovery needs to build seeds
// from (service + project type + audience + geography + need + positioning).
// So each businessServices item keeps its human-readable `name` (what the
// owner reviews) and gains a `facets` object holding the structured
// interpretation underneath it.
//
// Every facet value carries its own provenance:
//   owner        - typed in by the owner (onboarding or manual add)
//   website      - the value literally appears in the scraped website text
//                  (verified here, deterministically - NOT taken on the AI's
//                  word)
//   ai_inference - proposed by the AI but not found verbatim on the site
//                  (an interpretation, e.g. "Commercial" from "לעסקים")
// plus the page URL it came from where one is known. The AI's own claim
// about where a value came from is only trusted if the URL is one of the
// pages actually scraped in this run.

const FACET_DIMENSIONS = [
  "services", // core service(s) - one item can name several ("אדריכלות ועיצוב פנים")
  "projectTypes", // what kind of project ("בתים פרטיים", "דירות יוקרה")
  "audiences", // customer type ("משפחות", "יזמים")
  "markets", // market / sector ("מגורים", "מסחרי")
  "offerings", // packaged engagement ("ליווי 360°", "שיפוץ קומפלט")
  "geographies", // places named in the evidence
  "positioning", // qualifiers ("יוקרה", "בוטיק")
  "needs" // customer problem/need, only when the site states one
];

const MAX_VALUES_PER_DIMENSION = 5;
const MAX_VALUE_LENGTH = 80;
const MAX_EVIDENCE = 5;

function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[.,!?"'()[\]{}:;|\-–—°]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// One searchable text blob per scraped page, so a value/quote can be
// checked against the real evidence rather than trusted.
function buildPageCorpus(pagesEvidence) {
  return pagesEvidence.map((p) => ({
    url: p.url,
    text: normalizeText([p.title, p.metaDescription, (p.headings || []).join(" "), p.bodyText].join(" "))
  }));
}

// Substring rather than token match on purpose: Hebrew attaches prefixes
// (ל/ב/ה/ו...) to words with no space, so "מגורים" should count as found in
// "למגורים". Returns every page URL containing the text (corpus order).
function pagesContaining(corpus, text) {
  const needle = normalizeText(text);
  if (needle.length < 2) return [];
  return corpus.filter((page) => page.text.includes(needle)).map((page) => page.url);
}

// Resolves which page a value/quote came from. Provenance rule: a
// page-specific URL is never replaced by another page (in practice, the
// homepage, which is first in the corpus and repeats summaries of
// everything) just because that page also contains the text.
//   - the page the AI attributed it to, if the text really is on it
//   - otherwise the only/first page it is actually found on
//   - otherwise (not found verbatim anywhere) the AI's attribution, if it
//     names a page that was really crawled, unverified
// Returns { sourceUrl, verified, foundOn }.
function resolveSource(corpus, text, claimedUrl) {
  const validUrls = new Set(corpus.map((p) => p.url));
  const claimed = typeof claimedUrl === "string" && validUrls.has(claimedUrl) ? claimedUrl : null;
  const foundOn = pagesContaining(corpus, text);
  if (claimed && foundOn.includes(claimed)) return { sourceUrl: claimed, verified: true, foundOn };
  if (foundOn.length > 0) return { sourceUrl: foundOn[0], verified: true, foundOn };
  return { sourceUrl: claimed, verified: false, foundOn };
}

// Back-compat helper: first page containing the text, or null.
function findInCorpus(corpus, text) {
  const pages = pagesContaining(corpus, text);
  return pages.length > 0 ? pages[0] : null;
}

function emptyFacets() {
  return FACET_DIMENSIONS.reduce((acc, dim) => {
    acc[dim] = [];
    return acc;
  }, {});
}

// Turns the AI's raw facet object into the stored shape, dropping anything
// malformed and assigning provenance from the evidence itself.
function sanitizeAiFacets(rawFacets, corpus) {
  const facets = emptyFacets();
  if (!rawFacets || typeof rawFacets !== "object") return facets;
  for (const dim of FACET_DIMENSIONS) {
    const rawList = Array.isArray(rawFacets[dim]) ? rawFacets[dim] : [];
    const seen = new Set();
    for (const raw of rawList) {
      const value = (typeof raw === "string" ? raw : raw && raw.value ? raw.value : "").trim().slice(0, MAX_VALUE_LENGTH);
      if (!value) continue;
      const key = normalizeText(value);
      if (seen.has(key)) continue;
      seen.add(key);

      const src = resolveSource(corpus, value, raw && raw.url);
      facets[dim].push({
        value,
        provenance: src.verified ? "website" : "ai_inference",
        sourceUrl: src.sourceUrl,
        // Every crawled page the value appears on - a value supported by
        // several pages keeps all of them, not just one.
        foundOn: src.foundOn.slice(0, 5)
      });
      if (facets[dim].length >= MAX_VALUES_PER_DIMENSION) break;
    }
  }
  return facets;
}

// Evidence quotes keep their page URL, and are marked verified only if the
// quote really appears in that run's scraped text.
function sanitizeAiEvidence(rawEvidence, corpus) {
  const list = Array.isArray(rawEvidence) ? rawEvidence : [];
  const out = [];
  for (const raw of list) {
    const quote = (typeof raw === "string" ? raw : raw && raw.quote ? raw.quote : "").trim();
    if (!quote) continue;
    const src = resolveSource(corpus, quote, raw && raw.url);
    // provenance: "website" when the quote was found verbatim on the cited
    // page in this crawl, otherwise "ai_inference" (an AI paraphrase).
    out.push({ quote, sourceUrl: src.sourceUrl, verified: src.verified, provenance: src.verified ? "website" : "ai_inference" });
    if (out.length >= MAX_EVIDENCE) break;
  }
  return out;
}

// Facets for an owner-entered item (onboarding services[] or manual add):
// the owner's own words are the core service, and onboarding geographies
// apply. Nothing else is guessed for them.
function ownerFacets(name, geographies) {
  const facets = emptyFacets();
  facets.services.push({ value: name, provenance: "owner", sourceUrl: null });
  for (const g of geographies || []) {
    const value = (g || "").trim();
    if (value) facets.geographies.push({ value, provenance: "owner", sourceUrl: null });
  }
  return facets;
}

// Union per dimension by normalized value. Existing entries win (so an
// owner-provenance value is never overwritten by an AI one), except that
// an ai_inference entry is upgraded when the same value is now verified on
// the website.
function mergeFacets(existing, incoming) {
  const merged = emptyFacets();
  for (const dim of FACET_DIMENSIONS) {
    const byKey = new Map();
    for (const entry of (existing && existing[dim]) || []) {
      byKey.set(normalizeText(entry.value), { ...entry });
    }
    for (const entry of (incoming && incoming[dim]) || []) {
      const key = normalizeText(entry.value);
      const current = byKey.get(key);
      if (!current) byKey.set(key, { ...entry });
      else if (current.provenance === "ai_inference" && entry.provenance === "website") byKey.set(key, { ...entry });
    }
    merged[dim] = [...byKey.values()].slice(0, MAX_VALUES_PER_DIMENSION * 2);
  }
  return merged;
}

// Only the owner's own facet values - used when a newer analysis version
// supersedes everything the AI said before.
function keepOwnerFacets(facets) {
  const kept = emptyFacets();
  for (const dim of FACET_DIMENSIONS) {
    kept[dim] = ((facets && facets[dim]) || []).filter((v) => v.provenance === "owner");
  }
  return kept;
}

function hasAnyFacet(facets) {
  return !!facets && FACET_DIMENSIONS.some((dim) => Array.isArray(facets[dim]) && facets[dim].length > 0);
}

module.exports = {
  FACET_DIMENSIONS,
  normalizeText,
  buildPageCorpus,
  findInCorpus,
  resolveSource,
  emptyFacets,
  sanitizeAiFacets,
  sanitizeAiEvidence,
  ownerFacets,
  mergeFacets,
  keepOwnerFacets,
  hasAnyFacet
};
