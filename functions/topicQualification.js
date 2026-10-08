// GuyHadas Visibility OS - M3.2 lightweight preliminary qualification
// (docs/MASTER.md §9, docs/M3.2_IMPLEMENTATION_BRIEF.md §8).
//
// Deterministic, explainable hints attached to a Search Topic to help the
// owner review it. NOT the future Search Intent object (§17), not
// ownership, not opportunity scoring, and it never changes a topic's owner
// status or excludes anything - the owner decides.
//
//   qualification: "likely_relevant" | "needs_review" | "possible_mismatch"
//   preliminaryIntent: "commercial" | "informational" | "navigational" |
//                      "local" | "unclassified"
//   reasons: [{ code, detail }]  - every classification is explained
//
// Matching is plain substring / token containment on normalized text, the
// same deterministic style as the rest of the pipeline (no Hebrew stemming -
// see textSimilarity.js for why).

const { normalizePhrase } = require("./seedBuilder");

const COMMERCIAL_MODIFIERS = ["מחיר", "מחירים", "עלות", "עלויות", "כמה עולה", "המלצות", "מומלץ", "הכי טוב", "הטוב ביותר", "הצעת מחיר", "price", "prices", "cost", "best", "hire", "quote", "near me"];
const INFORMATIONAL_MODIFIERS = ["איך", "מה זה", "מהו", "מהי", "רעיונות", "טיפים", "מדריך", "השראה", "how", "what is", "ideas", "tips", "guide", "inspiration"];

function containsPhrase(text, phrase) {
  const t = ` ${normalizePhrase(text)} `;
  const p = normalizePhrase(phrase);
  return p.length > 0 && t.includes(` ${p} `);
}

// A service term "matches" when the whole term appears in the text, or -
// for multi-word terms - when at least half of its tokens (and at least two)
// appear.
function matchesTerm(text, term) {
  if (containsPhrase(text, term)) return true;
  const tokens = normalizePhrase(term).split(" ").filter((t) => t.length > 1);
  if (tokens.length < 2) return false;
  const have = new Set(normalizePhrase(text).split(" "));
  const hits = tokens.filter((t) => have.has(t)).length;
  return hits >= 2 && hits / tokens.length >= 0.5;
}

// context: { serviceTerms: [{term, serviceName}], ownerGeographies: [],
//            rejectedTerms: [], brandTerms: [], strategicTerms: [] }
function qualifyTopic({ title, queries = [] }, context) {
  const texts = [title, ...queries].filter(Boolean);
  const anyText = (pred) => texts.find(pred) || null;
  const reasons = [];

  const service = (context.serviceTerms || []).find((s) => anyText((t) => matchesTerm(t, s.term)));
  if (service) reasons.push({ code: "matches_confirmed_service", detail: service.serviceName });

  const geo = (context.ownerGeographies || []).find((g) => anyText((t) => containsPhrase(t, g)));
  if (geo) reasons.push({ code: "matches_owner_geography", detail: geo });

  const brand = (context.brandTerms || []).find((b) => anyText((t) => containsPhrase(t, b)));
  if (brand) reasons.push({ code: "matches_brand_term", detail: brand });

  const strategic = (context.strategicTerms || []).find((s) => anyText((t) => containsPhrase(t, s)));
  if (strategic) reasons.push({ code: "matches_strategic_priority", detail: strategic });

  const rejected = (context.rejectedTerms || []).find((r) => anyText((t) => matchesTerm(t, r)));
  if (rejected) reasons.push({ code: "matches_rejected_service", detail: rejected });

  const commercial = COMMERCIAL_MODIFIERS.find((m) => anyText((t) => containsPhrase(t, m)));
  if (commercial) reasons.push({ code: "commercial_modifier", detail: commercial });
  const informational = INFORMATIONAL_MODIFIERS.find((m) => anyText((t) => containsPhrase(t, m)));
  if (informational) reasons.push({ code: "informational_modifier", detail: informational });

  if (!service && !brand && !strategic) reasons.push({ code: "no_confirmed_service_match", detail: null });

  let qualification = "needs_review";
  if (rejected && !service) qualification = "possible_mismatch";
  else if (service || brand || strategic) qualification = "likely_relevant";

  let preliminaryIntent = "unclassified";
  if (brand) preliminaryIntent = "navigational";
  else if (commercial) preliminaryIntent = "commercial";
  else if (informational) preliminaryIntent = "informational";
  else if (geo) preliminaryIntent = "local";

  return { qualification, preliminaryIntent, qualificationReasons: reasons };
}

// Builds the qualification context from Firestore-shaped rows.
function buildQualificationContext({ business, services = [], knowledge = [] }) {
  const serviceTerms = [];
  for (const s of services.filter((x) => x.ownerStatus === "confirmed")) {
    const terms = new Set([s.name, ...(s.aliases || [])]);
    for (const fv of (s.facets && s.facets.services) || []) {
      if (fv.provenance === "owner" || fv.provenance === "website") terms.add(fv.value);
    }
    for (const term of terms) if (normalizePhrase(term)) serviceTerms.push({ term, serviceName: s.name });
  }
  const rejectedTerms = [];
  for (const s of services.filter((x) => x.ownerStatus === "rejected")) {
    for (const n of [s.name, ...(s.aliases || [])]) if (normalizePhrase(n)) rejectedTerms.push(n);
  }
  const ownerGeographies = [...(business.geographicMarkets || [])];
  for (const s of services.filter((x) => x.ownerStatus === "confirmed")) {
    for (const fv of (s.facets && s.facets.geographies) || []) {
      if (fv.provenance === "owner" && !ownerGeographies.includes(fv.value)) ownerGeographies.push(fv.value);
    }
  }
  const byType = (type) => knowledge.filter((k) => k.type === type).map((k) => k.content).filter(Boolean);
  const brandTerms = [...(business.name ? [business.name] : []), ...byType("brand_terminology")];
  return { serviceTerms, ownerGeographies, rejectedTerms, brandTerms, strategicTerms: byType("strategic_priority") };
}

module.exports = { qualifyTopic, buildQualificationContext, matchesTerm };
