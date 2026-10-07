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
const { extractDomain, fetchWithTimeout, discoverSitePages } = require("./webUtils");

const SERVICE_MERGE_THRESHOLD = 0.6; // tighter than Search Topics' 0.5 - service names are short, so a looser threshold would wrongly merge distinct services that just share one word (e.g. "עיצוב פנים" / "עיצוב גרפי")
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Verified against platform.claude.com/docs/en/about-claude/models/overview
// at implementation time, not guessed - see the Milestone 3.1 deliverable
// doc for the source. If Anthropic ships a newer model later, update this
// one constant.
const ANTHROPIC_MODEL = "claude-sonnet-5-5";

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
  const headings = $("h1, h2")
    .map((_, el) => $(el).text().trim().replace(/\s+/g, " "))
    .get()
    .filter((t) => t.length > 0)
    .slice(0, 10);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 600);
  return { url, title, metaDescription, headings, bodyText };
}

function buildServiceInferencePrompt(business, confirmedServiceNames, pagesEvidence) {
  const context = [];
  context.push(`Business name: ${business.name}`);
  if (business.industry) context.push(`Industry: ${business.industry}`);
  if (business.description) context.push(`Description: ${business.description}`);
  if (business.targetAudience) context.push(`Target audience: ${business.targetAudience}`);
  if (business.geographicMarkets && business.geographicMarkets.length) {
    context.push(`Geographic markets: ${business.geographicMarkets.join(", ")}`);
  }
  if (business.businessObjectives) context.push(`Business objectives: ${business.businessObjectives}`);
  if (confirmedServiceNames.length) {
    context.push(
      `Services the owner has already confirmed (do NOT repeat these - only propose additional, distinct services/offerings not already covered): ${confirmedServiceNames.join(", ")}`
    );
  }

  const evidenceBlock = pagesEvidence
    .map(
      (p, i) =>
        `Page ${i + 1} (${p.url}):\nTitle: ${p.title}\nMeta description: ${p.metaDescription}\nHeadings: ${p.headings.join(" | ")}\nBody excerpt: ${p.bodyText}`
    )
    .join("\n\n");

  return `You are analyzing a business's own website to identify the distinct services or offerings it actually provides, for an SEO/GEO search-visibility tool. Read the business context and website evidence below, then propose the services/offerings this business provides.

Business context:
${context.join("\n")}

Website evidence:
${evidenceBlock}

Respond with ONLY a JSON array (no prose, no markdown code fences), where each item has exactly this shape:
{"name": "short service name, in the same language as the website content", "description": "one-sentence description", "geographies": ["city/region names actually mentioned in the evidence, if any"], "evidence": ["short exact quotes or close paraphrases from the evidence above that justify this service"]}

Propose between 2 and 10 distinct, non-overlapping services. Do not invent a service with no support in the business context or website evidence above.`;
}

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
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Anthropic API error: ${json?.error?.message || res.statusText}`);
  }
  const text = (json.content || []).map((block) => block.text || "").join("");
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse AI response as JSON: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array");
  }
  return parsed;
}

exports.visibilityAnalyzeBusiness = functions
  .runWith({ secrets: ["ANTHROPIC_API_KEY"] })
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
        return { id: d.id, name: data.name, source: data.source, ownerStatus: data.ownerStatus, tokens: tokenize(data.name) };
      });

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
          createdAt: now,
          updatedAt: now
        });
        known.push({ id: ref.id, name, source: "owner", ownerStatus: "confirmed", tokens });
        ownerServicesSeeded++;
      }

      // Step 2: scrape the website for evidence (not for topics - see the
      // file header).
      let pagesEvidence = [];
      if (business.website) {
        const domain = extractDomain(business.website);
        const origin = `https://${domain}`;
        const pages = await discoverSitePages(origin, cheerio);
        for (const pageUrl of pages) {
          const html = await fetchWithTimeout(pageUrl);
          if (!html) continue;
          pagesEvidence.push(extractEvidenceFromHtml(html, pageUrl));
        }
      }

      // Step 3: AI-assisted inference, only if configured and there's
      // something to read. Degrades gracefully - if this throws, the
      // owner-seeded services from step 1 have already succeeded.
      let aiServicesProposed = 0;
      let aiServicesMerged = 0;
      const aiAvailable = isAiConfigured();
      if (aiAvailable && pagesEvidence.length > 0) {
        try {
          const confirmedNames = known.filter((s) => s.ownerStatus === "confirmed").map((s) => s.name);
          const prompt = buildServiceInferencePrompt(business, confirmedNames, pagesEvidence);
          const proposals = await proposeServicesWithAi(prompt);

          for (const p of proposals) {
            const name = (p && p.name ? p.name : "").trim();
            if (!name) continue;
            const tokens = tokenize(name);
            const match = known.find((s) => jaccard(tokens, s.tokens) >= SERVICE_MERGE_THRESHOLD);
            const evidence = Array.isArray(p.evidence) ? p.evidence.slice(0, 5) : [];
            const geographies = Array.isArray(p.geographies) ? p.geographies : [];

            if (match) {
              // Merge into the existing service rather than creating a
              // near-duplicate. If it was owner-entered, mark the richer
              // provenance as "combined" (both the owner and the website
              // evidence point to this service) rather than overwriting it.
              const updateData = { updatedAt: now };
              if (match.source === "owner") updateData.source = "combined";
              if (evidence.length > 0) updateData.evidence = admin.firestore.FieldValue.arrayUnion(...evidence);
              await db.collection("businessServices").doc(match.id).update(updateData);
              aiServicesMerged++;
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
              createdAt: now,
              updatedAt: now
            });
            known.push({ id: ref.id, name, source: "ai_inference", ownerStatus: "needs_review", tokens });
            aiServicesProposed++;
          }
        } catch (aiErr) {
          console.error("visibilityAnalyzeBusiness AI step failed:", aiErr.message);
        }
      }

      res.status(200).json({
        success: true,
        ownerServicesSeeded,
        aiServicesProposed,
        aiServicesMerged,
        pagesScanned: pagesEvidence.length,
        aiAvailable
      });
    } catch (err) {
      console.error("visibilityAnalyzeBusiness error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
