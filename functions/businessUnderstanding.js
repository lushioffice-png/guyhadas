// GuyHadas Visibility OS - Business & Service Discovery (roadmap Milestone
// 3.1). This is the layer the corrected architecture inserts BEFORE search
// discovery:
//
//   Business onboarding + Website understanding -> Business understanding
//   -> Service / Offer Map -> (owner validation) -> Search Discovery seeds
//
// The mistake this corrects: functions/searchUniverse.js's old website
// scanner treated every title/heading scraped off the business's own
// marketing site as a search topic directly. A marketing/design website is
// written to sell, not as an SEO keyword database, so that produced noise.
// The website is evidence for understanding WHAT THE BUSINESS SELLS, not a
// direct source of search demand - that distinction is the whole point of
// this file.
//
// visibilityAnalyzeBusiness does two genuinely different things, and keeps
// them labeled separately per business service (source/confidence fields):
//
//   1. Deterministic, no AI, no cost: the services already typed in at
//      onboarding (businesses.services[], Milestone 1) become confirmed
//      services immediately - the owner already said these are real, so
//      there's nothing to review. Works even with ANTHROPIC_API_KEY unset.
//   2. AI-assisted, gated behind ANTHROPIC_API_KEY (same pattern as
//      SEMRUSH_API_KEY in functions/semrush.js - the function exists and
//      deploys fine, but returns a clean "not available" signal until a
//      real key is set): the website is scraped for evidence (titles,
//      headings, body text - navigation/footer stripped first to cut
//      boilerplate noise) and handed to Claude along with the business's
//      onboarding context, asked to propose the DISTINCT services/offerings
//      this business actually provides, each with a short justification
//      quoted from the evidence. These land as ownerStatus:"needs_review" -
//      machine inference never silently becomes business truth.
//
// Deduping (merging a newly proposed service into an existing one instead
// of creating a near-duplicate) reuses the same deterministic Jaccard
// token-overlap helper searchUniverse.js uses for Search Topics - see
// functions/textSimilarity.js. Only the "what does this business sell"
// judgment itself uses AI; grouping stays mechanical.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cheerio = require("cheerio");
const { setCors, requireAdmin } = require("./visibility");
const { tokenize, jaccard } = require("./textSimilarity");
const { crawlSite } = require("./webUtils");
const { runGoverned } = require("./apiUsage");
const { parseAiServiceReply, mergeProposals, SERVICE_MERGE_THRESHOLD } = require("./serviceMapMerge");
const apiLimits = require("./apiLimits");
const { buildPageCorpus, ownerFacets, hasAnyFacet } = require("./serviceFacets");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// 12000: with a multi-page crawl (up to 15 pages) a full structured reply in
// Hebrew ran past 4096 tokens and was cut off mid-JSON (2026-10-07). Hebrew
// tokenizes heavily, so this needs real headroom.
const ANTHROPIC_MAX_TOKENS = 12000; // kept as a named constant - it's also the worst-case output used for the pre-call cost estimate below, so the two must stay in sync
// Verified against platform.claude.com/docs/en/about-claude/models/overview
// at implementation time, not guessed - see the Milestone 3.1 deliverable
// doc for the source. If Anthropic ships a newer model later, update this
// one constant.
const ANTHROPIC_MODEL = "claude-sonnet-5-5";
// Bumped whenever the prompt or the expected response shape changes. It is
// part of the governed (cached) input, so a result cached under an older
// prompt is never reused for the new shape - one fresh call, then cached
// again as usual. v2 = structured facets + per-quote source URLs.
// v3 = multi-page crawl + per-page evidence attribution rules.
const SERVICE_PROMPT_VERSION = 3;
// Version of the deterministic pipeline around the Claude call - the crawl,
// evidence extraction and the contract for how a result is merged into the
// Service Map. Part of the cache identity (with the model and the input
// hash, which already includes the prompt version). Bump it when that
// pipeline changes in a way that should invalidate cached AI results even
// though the website content didn't change. v1 = the pipeline as of
// 2026-10-07 (multi-page crawl, page-level provenance).
const ANALYSIS_VERSION = 1;

function isAiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function extractEvidenceFromHtml(html, url) {
  const $ = cheerio.load(html);
  // Strip nav/footer/script/style before reading headings or body text -
  // otherwise every page's evidence is dominated by the same repeated menu
  // items rather than that page's actual content, which was a real
  // contributor to the old scanner's noise.
  $("script, style, nav, footer, header").remove();
  const title = $("title").first().text().trim();
  const metaDescription = ($('meta[name="description"]').attr("content") || "").trim();
  // h3 included and the body excerpt raised from 600 chars: inner pages
  // (services, client types, projects) carry their specifics below the
  // first heading, and that page-specific text is the evidence we want.
  const headings = $("h1, h2, h3")
    .map((_, el) => $(el).text().trim().replace(/\s+/g, " "))
    .get()
    .filter((t) => t.length > 0)
    .slice(0, 15);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 1500);
  return { url, title, metaDescription, headings, bodyText };
}

function buildServiceInferencePrompt(business, knownNames, rejectedNames, pagesEvidence) {
  const context = [];
  context.push(`Business name: ${business.name}`);
  if (business.industry) context.push(`Industry: ${business.industry}`);
  if (business.description) context.push(`Description: ${business.description}`);
  if (business.targetAudience) context.push(`Target audience: ${business.targetAudience}`);
  if (business.geographicMarkets && business.geographicMarkets.length) {
    context.push(`Geographic markets: ${business.geographicMarkets.join(", ")}`);
  }
  if (business.businessObjectives) context.push(`Business objectives: ${business.businessObjectives}`);
  if (knownNames.length) {
    context.push(
      `Items already on this business's service map: ${knownNames.join(" | ")}. Include each of these in your output too (set "existingName" to the exact name above) so they get the same structured interpretation - do not propose near-duplicates of them as new items.`
    );
  }
  if (rejectedNames.length) {
    context.push(`Items the owner has rejected (do NOT propose these again, or close variants): ${rejectedNames.join(" | ")}`);
  }

  const evidenceBlock = pagesEvidence
    .map(
      (p, i) =>
        `Page ${i + 1} (${p.url}):\nTitle: ${p.title}\nMeta description: ${p.metaDescription}\nHeadings: ${p.headings.join(" | ")}\nBody excerpt: ${p.bodyText}`
    )
    .join("\n\n");

  return `You are analyzing a business's own website to build a structured map of what it sells, for an SEO/GEO search-visibility tool. Each item is something the business offers, as the website presents it, plus a structured breakdown of the separate dimensions packed into it.

Business context:
${context.join("\n")}

Website evidence:
${evidenceBlock}

Respond with ONLY a JSON array (no prose, no markdown code fences). Each item has exactly this shape:
{
  "name": "the offering as a short human-readable label, close to how the website phrases it, in the website's language",
  "existingName": "exact name of the already-known item this corresponds to, or null if it is new",
  "description": "one-sentence description",
  "facets": {
    "services": [{"value": "core service(s) - list several if the item combines them", "url": "page URL"}],
    "projectTypes": [{"value": "kind of project, e.g. type of property or space", "url": "page URL"}],
    "audiences": [{"value": "customer type", "url": "page URL"}],
    "markets": [{"value": "market or sector, e.g. residential vs commercial", "url": "page URL"}],
    "offerings": [{"value": "a packaged engagement or service model", "url": "page URL"}],
    "geographies": [{"value": "place named in the evidence", "url": "page URL"}],
    "positioning": [{"value": "qualifier such as a price tier or style", "url": "page URL"}],
    "needs": [{"value": "customer problem or need, only if the website states one", "url": "page URL"}]
  },
  "evidence": [{"quote": "short exact quote from the evidence above", "url": "the page URL it came from"}]
}

Rules:
- Facet values are short terms in the website's language. Leave a dimension as an empty array when the evidence does not support it - never fill a dimension just to fill it.
- Derive every value from the evidence or business context above. Do not invent.
- Keep one item per offering as the website presents it; put its separate dimensions in facets rather than splitting it into several items.
- "url" must be one of the page URLs listed above, and must be the page the quote or value actually appears on.
- Evidence must keep its originating page. When several pages support an item, give quotes from each of them (one evidence entry per page), and prefer the most specific page (e.g. a service or client-type page) over a general summary on the homepage.
- Return between 2 and 12 items in total (already-known items included).
- At most 3 evidence quotes per item, each a short phrase (under 15 words).
- Output compact JSON on as few lines as possible - no indentation, no extra whitespace.`;
}

// Returns { proposals, usage } rather than just the parsed array - usage
// (Anthropic's own reported input_tokens/output_tokens, plus the response
// id) is what lets the governor record a real cost on the ledger instead
// of just the rough pre-call estimate. See estimatePreCallCostUsd below
// for the estimate, and computeActualCostUsd for what turns these real
// token counts into a $ figure.
async function proposeServicesWithAi(prompt) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const json = await res.json().catch(() => ({}));
  return parseAiServiceReply(res, json, ANTHROPIC_MAX_TOKENS);
}

// Pre-call budget gate, BEFORE anything is sent to Claude. Deliberately a
// rough chars/4 heuristic (mixed Hebrew/English marketing text doesn't
// tokenize as cleanly as English prose) with the output side capped at
// ANTHROPIC_MAX_TOKENS (the real worst case, since that's the hard limit
// passed to the API) - good enough to catch a runaway prompt before it's
// sent, not a claim of exact cost. The ledger's actualCostUsd, computed
// from Anthropic's own reported token counts after the call, is what
// later budget checks actually rely on - see the cost-control rule's
// "never pretend an exact cost is known when it is not."
function estimatePreCallCostUsd(prompt) {
  const limits = apiLimits.anthropic.analyzeBusinessServices;
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  return (
    (estimatedInputTokens / 1e6) * limits.inputPricePerMTokUsd + (ANTHROPIC_MAX_TOKENS / 1e6) * limits.outputPricePerMTokUsd
  );
}

function computeActualCostUsd(inputTokens, outputTokens) {
  if (inputTokens == null || outputTokens == null) return null;
  const limits = apiLimits.anthropic.analyzeBusinessServices;
  return (inputTokens / 1e6) * limits.inputPricePerMTokUsd + (outputTokens / 1e6) * limits.outputPricePerMTokUsd;
}

exports.visibilityAnalyzeBusiness = functions
  // 300s: a crawl of up to 15 pages (8s timeout each, 5 at a time) plus the
  // Claude call no longer fits safely in the 60s default.
  // memory 1GB: the shared functions bundle loads googleapis at startup, so
  // the 256MB default left too little room for a 15-page crawl - a live
  // run on 2026-10-07 crashed with "Memory limit of 256 MiB exceeded"
  // mid-crawl (the browser saw only "Failed to fetch").
  .runWith({ secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 300, memory: "1GB" })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    const user = await requireAdmin(req, res);
    if (!user) return;

    const { businessId, forceRefresh } = req.body || {};
    if (!businessId) {
      res.status(400).json({ success: false, error: "businessId is required" });
      return;
    }

    try {
      const db = admin.firestore();
      const bizDoc = await db.collection("businesses").doc(businessId).get();
      if (!bizDoc.exists) {
        res.status(404).json({ success: false, error: "Business not found" });
        return;
      }
      const business = bizDoc.data();
      const now = admin.firestore.FieldValue.serverTimestamp();

      const existingSnap = await db.collection("businessServices").where("businessId", "==", businessId).get();
      // Working in-memory copy, same pattern as searchUniverse.js's topics
      // cache - services created earlier in this same run also get matched
      // against, not just services that existed before this call.
      const known = existingSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          source: data.source,
          ownerStatus: data.ownerStatus,
          facets: data.facets || null,
          facetsVersion: data.facetsVersion || 0,
          tokens: tokenize(data.name)
        };
      });

      // Items created before facets existed: owner-entered ones get their
      // deterministic owner facets now (free, no AI). AI-proposed ones get
      // theirs from the AI step below, via existingName matching.
      for (const s of known) {
        if ((s.source === "owner" || s.source === "combined") && !hasAnyFacet(s.facets)) {
          s.facets = ownerFacets(s.name, s.source === "owner" ? business.geographicMarkets : []);
          await db.collection("businessServices").doc(s.id).update({ facets: s.facets, facetsVersion: SERVICE_PROMPT_VERSION });
        }
      }

      // Step 1: deterministic, no AI needed - the owner already typed these
      // in at onboarding, so they're confirmed immediately.
      let ownerServicesSeeded = 0;
      for (const rawName of business.services || []) {
        const name = (rawName || "").trim();
        if (!name) continue;
        const tokens = tokenize(name);
        const match = known.find((s) => jaccard(tokens, s.tokens) >= SERVICE_MERGE_THRESHOLD);
        if (match) continue;
        const ref = await db.collection("businessServices").add({
          businessId,
          name,
          description: "",
          source: "owner",
          confidence: "observed",
          ownerStatus: "confirmed",
          priority: "medium",
          geographies: business.geographicMarkets || [],
          evidence: [],
          facets: ownerFacets(name, business.geographicMarkets),
          facetsVersion: SERVICE_PROMPT_VERSION,
          createdAt: now,
          updatedAt: now
        });
        known.push({
          id: ref.id,
          name,
          source: "owner",
          ownerStatus: "confirmed",
          facets: ownerFacets(name, business.geographicMarkets),
          tokens
        });
        ownerServicesSeeded++;
      }

      // Step 2: crawl the website for evidence (not for topics - see the
      // file header). crawlSite reports what it discovered/fetched/skipped;
      // a page only counts as parsed if extraction found real text on it.
      let pagesEvidence = [];
      let crawl = null;
      if (business.website) {
        const { pages, report } = await crawlSite(business.website, cheerio);
        let pagesParsed = 0;
        for (const page of pages) {
          const evidence = extractEvidenceFromHtml(page.html, page.url);
          const hasText = evidence.title || evidence.headings.length > 0 || evidence.bodyText.length > 40;
          if (!hasText) {
            report.failed.push({ url: page.url, reason: "no readable text after extraction" });
            continue;
          }
          pagesEvidence.push(evidence);
          pagesParsed++;
        }
        crawl = {
          ...report,
          pagesParsed,
          parsedUrls: pagesEvidence.map((p) => p.url),
          skipped: report.skipped.slice(0, 50),
          skippedCount: report.skipped.length,
          failedCount: report.failed.length
        };
        console.log(
          `visibilityAnalyzeBusiness crawl ${businessId}: discovered=${crawl.pagesDiscovered} selected=${crawl.pagesSelected} fetched=${crawl.pagesFetched} parsed=${crawl.pagesParsed} failed=${crawl.failedCount} skipped=${crawl.skippedCount}`,
          JSON.stringify({ parsedUrls: crawl.parsedUrls, failed: crawl.failed })
        );
      }

      // Step 3: AI-assisted inference, only if configured and there's
      // something to read. Degrades gracefully as far as step 1's results
      // go - if this throws, the owner-seeded services have already
      // succeeded and are not rolled back. The failure itself is reported
      // back as `aiError`, not swallowed: `aiAvailable: true` with
      // `aiServicesProposed: 0` and no error previously looked identical
      // whether the AI step never ran, ran and genuinely found nothing, or
      // ran and failed (e.g. an invalid/placeholder API key, a network
      // error, a response that didn't parse as JSON).
      //
      // The actual Claude call now goes through runGoverned() (see
      // functions/apiUsage.js and the Universal External API Cost-Control
      // Rule in the project docs) - keyed on the confirmed-service names
      // plus the scraped website evidence, so re-running this on an
      // unchanged website/service list reuses the last result instead of
      // paying for another Claude call. The merge-into-businessServices
      // loop below always runs against the CURRENT state of
      // businessServices, cache hit or not - caching only skips asking
      // Claude again, never skips re-checking what the owner has since
      // confirmed/rejected.
      let aiServicesProposed = 0;
      let aiServicesMerged = 0;
      let aiRejectedSkipped = 0; // proposals matching an owner-rejected item, ignored
      let aiError = null;
      let aiBlockedReason = null;
      let aiCacheHit = false;
      let aiCostUsd = null;
      const aiAvailable = isAiConfigured();
      // The cost-control decision for this run - recorded on every run
      // record (businessAnalysisRuns) and returned to the UI.
      const costControl = {
        provider: "anthropic",
        analysisType: "service_map",
        promptVersion: SERVICE_PROMPT_VERSION,
        analysisVersion: ANALYSIS_VERSION,
        model: ANTHROPIC_MODEL,
        inputHash: null,
        cacheDecision: aiAvailable ? null : "not_applicable",
        cacheHit: false,
        forceRefresh: !!forceRefresh,
        providerCalled: false,
        costUsd: 0,
        cachedFromUsageId: null
      };
      if (aiAvailable && pagesEvidence.length === 0) {
        aiError = business.website
          ? "Could not read any pages from the business's website - check it's reachable and not blocking automated requests"
          : "This business has no website set in its profile, so there is nothing to analyze";
      } else if (aiAvailable && pagesEvidence.length > 0) {
        try {
          const knownNames = known
            .filter((s) => s.ownerStatus !== "rejected")
            .map((s) => s.name)
            .sort();
          const rejectedNames = known
            .filter((s) => s.ownerStatus === "rejected")
            .map((s) => s.name)
            .sort();
          const corpus = buildPageCorpus(pagesEvidence);
          // The cache key is deliberately narrower than the prompt. Only
          // what can change the answer goes in: the website evidence and
          // the owner's own items. Items the AI itself proposed earlier
          // (and the owner's confirm/reject/priority decisions on them) are
          // left out - otherwise every run that adds a proposal would
          // change the key and force another paid call next time. Those
          // decisions are still enforced on every run, cache hit or not, by
          // the merge loop below (matching existing items, skipping
          // rejected ones).
          const ownerNames = known
            .filter((s) => s.source === "owner" || s.source === "combined")
            .map((s) => s.name)
            .sort();

          const governed = await runGoverned({
            provider: "anthropic",
            operation: "analyzeBusinessServices",
            businessId,
            // Input shape unchanged since prompt v3 so existing ledger results
            // keep their hash; the model is part of the cache identity via
            // `model` below rather than the hash.
            input: { promptVersion: SERVICE_PROMPT_VERSION, ownerNames, pagesEvidence },
            model: ANTHROPIC_MODEL,
            analysisVersion: ANALYSIS_VERSION,
            forceRefresh: forceRefresh === true,
            reason: forceRefresh === true ? "owner_confirmed_new_paid_service_analysis" : "owner_requested_service_analysis",
            estimateCost: (input) =>
              estimatePreCallCostUsd(buildServiceInferencePrompt(business, knownNames, rejectedNames, input.pagesEvidence)),
            execute: async (input) => {
              const prompt = buildServiceInferencePrompt(business, knownNames, rejectedNames, input.pagesEvidence);
              try {
                const { proposals, usage } = await proposeServicesWithAi(prompt);
                const actualCostUsd = computeActualCostUsd(usage.inputTokens, usage.outputTokens);
                return { result: proposals, usage: { ...usage, actualCostUsd } };
              } catch (err) {
                // A billed reply that failed (cut off / malformed) still has a
                // real cost - pass it to the ledger.
                if (err.usage) err.usage.actualCostUsd = computeActualCostUsd(err.usage.inputTokens, err.usage.outputTokens);
                throw err;
              }
            }
          });

          aiCacheHit = governed.cacheHit;
          costControl.inputHash = governed.inputHash;
          costControl.cacheDecision = governed.decision;
          costControl.cacheHit = governed.cacheHit;
          costControl.providerCalled = governed.providerCalled;
          costControl.cachedFromUsageId = governed.cachedFromUsageId || null;
          if (governed.providerCalled && governed.usage) costControl.costUsd = governed.usage.actualCostUsd ?? null;

          if (!governed.ok) {
            aiBlockedReason = governed.blocked.reason;
            aiError = governed.blocked.message;
          } else {
            if (!governed.cacheHit && governed.usage) aiCostUsd = governed.usage.actualCostUsd;
            const mergeResult = await mergeProposals({
              db,
              businessId,
              known,
              proposals: governed.result,
              corpus,
              inputHash: governed.inputHash,
              now,
              verifiedAt: new Date().toISOString(),
              facetsVersion: SERVICE_PROMPT_VERSION
            });
            aiServicesProposed = mergeResult.proposed;
            aiServicesMerged = mergeResult.merged;
            aiRejectedSkipped = mergeResult.skippedRejected;
          }
        } catch (aiErr) {
          console.error("visibilityAnalyzeBusiness AI step failed:", aiErr.message);
          aiError = aiErr.message;
          if (aiErr.inputHash) costControl.inputHash = aiErr.inputHash;
          if (aiErr.decision) costControl.cacheDecision = aiErr.decision;
          if (aiErr.providerCalled) {
            costControl.providerCalled = true;
            costControl.costUsd = null; // the provider was called; its cost isn't known when the reply failed
          }
        }
      }

      // One record per run, kept permanently (historical data is permanent
      // per the roadmap) - the crawl report plus what the run produced.
      // Admin-read-only for clients; written only here via the Admin SDK.
      const runSummary = {
        ownerServicesSeeded,
        aiServicesProposed,
        aiServicesMerged,
        aiRejectedSkipped,
        pagesScanned: pagesEvidence.length,
        aiAvailable,
        aiError,
        aiBlockedReason,
        aiCacheHit,
        aiCostUsd,
        costControl,
        // completed | blocked (a cost/safety control stopped the AI step) |
        // ai_error (the AI step ran or tried to and failed)
        status: aiBlockedReason ? "blocked" : aiError ? "ai_error" : "completed"
      };
      console.log(
        `visibilityAnalyzeBusiness cost-control ${businessId}: decision=${costControl.cacheDecision} cacheHit=${costControl.cacheHit} providerCalled=${costControl.providerCalled} costUsd=${costControl.costUsd} model=${costControl.model} promptVersion=${costControl.promptVersion} force=${costControl.forceRefresh} inputHash=${costControl.inputHash}`
      );
      let analysisRunId = null;
      try {
        const runRef = await db.collection("businessAnalysisRuns").add({
          businessId,
          kind: "service_map",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          promptVersion: SERVICE_PROMPT_VERSION,
          crawl,
          ...runSummary
        });
        analysisRunId = runRef.id;
      } catch (runErr) {
        console.error("visibilityAnalyzeBusiness: could not record analysis run:", runErr.message);
      }

      res.status(200).json({
        success: true,
        analysisRunId,
        crawl,
        ownerServicesSeeded,
        aiServicesProposed,
        aiServicesMerged,
        pagesScanned: pagesEvidence.length,
        aiAvailable,
        aiError,
        aiBlockedReason,
        aiCacheHit,
        aiCostUsd,
        costControl,
        status: runSummary.status
      });
    } catch (err) {
      console.error("visibilityAnalyzeBusiness error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
