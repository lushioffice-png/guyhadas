// GuyHadas Visibility OS - M3.1 Service / Offer Map: turning a Claude reply
// into Service Map updates. Pure-ish helpers moved out of
// businessUnderstanding.js unchanged in behaviour so they can be tested
// directly (functions/test/serviceMapMerge.test.js):
//
//   parseAiServiceReply  - Claude HTTP reply -> proposals, or an error that
//                          carries the billed token usage. Truncated,
//                          malformed or non-array replies are NEVER treated
//                          as a successful analysis.
//   mergeProposals       - proposals + current Service Map -> Firestore
//                          writes, enforcing the owner-truth rules:
//                            - rejected items are never re-proposed/modified
//                            - existing items keep name/description/status/
//                              priority; only facets/evidence are attached
//                            - owner facet values are never overwritten
//                            - website provenance only when verified on the
//                              crawled page (serviceFacets.js)

const { tokenize, jaccard } = require("./textSimilarity");
const { sanitizeAiFacets, sanitizeAiEvidence, mergeFacets, keepOwnerFacets } = require("./serviceFacets");

// tighter than Search Topics' 0.5 - service names are short, so a looser
// threshold would wrongly merge distinct services that share one word
const SERVICE_MERGE_THRESHOLD = 0.6;

// `res` is { ok, statusText }, `json` the parsed body. Throws on any reply
// that isn't a complete, well-formed JSON array; the thrown error carries
// `usage` (tokens actually billed) whenever the provider reported it.
function parseAiServiceReply(res, json, maxTokens) {
  json = json || {};
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${json?.error?.message || res.statusText}`);
  }
  const usage = {
    inputTokens: json.usage && typeof json.usage.input_tokens === "number" ? json.usage.input_tokens : null,
    outputTokens: json.usage && typeof json.usage.output_tokens === "number" ? json.usage.output_tokens : null,
    requestId: json.id || null
  };
  const fail = (message) => Object.assign(new Error(message), { usage });
  const text = (json.content || []).map((block) => block.text || "").join("");
  // A reply that hit the output limit is cut off mid-JSON. Say that plainly
  // instead of surfacing it as a confusing parse error.
  if (json.stop_reason === "max_tokens") {
    throw fail(
      `AI reply was cut off at the ${maxTokens}-token output limit before it finished (${json.usage?.output_tokens ?? "?"} tokens written) - the result was not used`
    );
  }
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  // Tolerate a stray sentence before/after the array.
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw fail(`Could not parse AI response as JSON: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw fail("AI response was not a JSON array");
  }
  return { proposals: parsed, usage };
}

// Every name an existing item is known by: its current name plus the
// names it had before the owner renamed it (`aliases`). Matching against
// all of them means a rename never makes the AI's original wording come
// back as a "new" candidate, and a renamed-then-rejected item stays out.
function namesOf(item) {
  return [item.name, ...(Array.isArray(item.aliases) ? item.aliases : [])].filter(Boolean);
}

function findKnownMatch(known, name, existingName) {
  const tokens = tokenize(name);
  if (existingName) {
    const byExisting = known.find((s) => namesOf(s).includes(existingName));
    if (byExisting) return byExisting;
  }
  const exact = known.find((s) => namesOf(s).includes(name));
  if (exact) return exact;
  return known.find((s) => namesOf(s).some((n) => jaccard(tokens, tokenize(n)) >= SERVICE_MERGE_THRESHOLD)) || null;
}

// known: [{ id, name, aliases?, source, ownerStatus, facets, facetsVersion, tokens }]
// (mutated as items are created/updated, so later proposals in the same
// run match against them too).
async function mergeProposals({ db, businessId, known, proposals, corpus, inputHash, now, verifiedAt, facetsVersion }) {
  let proposed = 0;
  let merged = 0;
  let skippedRejected = 0;

  for (const p of Array.isArray(proposals) ? proposals : []) {
    const name = (p && p.name ? p.name : "").trim();
    if (!name) continue;
    const tokens = tokenize(name);
    const existingName = p && typeof p.existingName === "string" ? p.existingName.trim() : "";
    const match = findKnownMatch(known, name, existingName);
    if (match && match.ownerStatus === "rejected") {
      skippedRejected++; // never resurrect or modify what the owner rejected
      continue;
    }
    const facets = sanitizeAiFacets(p.facets, corpus);
    // Each quote keeps its page, provenance, the analysis it came from (the
    // input hash - identical on free re-runs) and when it was verified
    // against the crawled page.
    const evidenceSources = sanitizeAiEvidence(p.evidence, corpus).map((e) => ({ ...e, analysisInputHash: inputHash, verifiedAt }));
    const evidence = evidenceSources.map((e) => e.quote);
    const sourceUrls = [...new Set(evidenceSources.map((e) => e.sourceUrl).filter(Boolean))];
    const geographies = facets.geographies.map((g) => g.value);

    if (match) {
      // Attach structure to the existing item instead of creating a
      // near-duplicate. Name, description, status and priority untouched.
      // An item last analyzed under an older version gets its AI-derived
      // facets replaced (owner values kept); otherwise facets are merged
      // with owner values always winning (mergeFacets).
      const supersedes = (match.facetsVersion || 0) < facetsVersion;
      const baseFacets = supersedes ? keepOwnerFacets(match.facets) : match.facets;
      const mergedFacets = mergeFacets(baseFacets, facets);
      const updateData = { updatedAt: now, facets: mergedFacets, facetsVersion };
      if (match.source === "owner") updateData.source = "combined";
      // AI-derived evidence reflects the latest analysis of the site:
      // replaced, never appended (no stale/duplicate accumulation).
      if (supersedes || evidenceSources.length > 0) {
        updateData.evidence = evidence;
        updateData.evidenceSources = evidenceSources;
        updateData.sourceUrls = sourceUrls;
      }
      await db.collection("businessServices").doc(match.id).update(updateData);
      match.facets = mergedFacets;
      match.facetsVersion = facetsVersion;
      if (match.source === "owner") match.source = "combined";
      merged++;
      continue;
    }

    const ref = await db.collection("businessServices").add({
      businessId,
      name,
      description: typeof p.description === "string" ? p.description : "",
      source: "ai_inference",
      confidence: "inferred",
      ownerStatus: "needs_review",
      priority: "medium",
      geographies,
      evidence,
      evidenceSources,
      sourceUrls,
      facets,
      facetsVersion,
      createdAt: now,
      updatedAt: now
    });
    known.push({ id: ref.id, name, source: "ai_inference", ownerStatus: "needs_review", facets, facetsVersion, tokens });
    proposed++;
  }
  return { proposed, merged, skippedRejected };
}

module.exports = { parseAiServiceReply, mergeProposals, findKnownMatch, SERVICE_MERGE_THRESHOLD };
