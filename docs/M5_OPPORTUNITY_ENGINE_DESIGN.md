# M5 — Opportunity Engine — Design & Implementation Notes

**`docs/MASTER.md` is canonical** (§20 Opportunity Engine, §21 Decision Engine boundary, §22 Evidence & Confidence, §32 Caching, §38.5 Baseline, §43 rules, §46 freshness). This document records the M5 design that was written before code, the decisions taken, and the implementation status. Where it and MASTER differ, MASTER wins.

Repository state at design time: `main` @ `bf8f3a7` (M4 merged and live-validated; UX refactor #23–#27 merged; MASTER refreshed 2026-10-09).

---

## 0. Freshness gate (MASTER §46) — re-verified 2026-10-09

| Claim used by M5 | Status | Effect on design |
|---|---|---|
| Google: no additional technical requirements, special optimizations or special schema.org markup are needed to appear in AI Overviews / AI Mode (developers.google.com/search/docs/appearance/ai-features, last updated 2025-12-10) | CURRENT | GEO opportunities are framed as *making business facts explicit and consistent on the site*, labelled ASSUMPTION, never as an "AI ranking factor" or "AI schema" |
| FAQ rich results retired in 2026 | CURRENT (multiple sources) | M5 never proposes FAQ markup |
| Search Analytics rowLimit up to 25,000 rows | CURRENT (MASTER §46.4) | M4 still requests 1,000 rows — noted as a data gap/follow-up, not changed in M5 |
| "Striking distance" (positions ~4–20 respond best to improvement), industry CTR-by-position curves | HISTORICAL PRACTICE / HYPOTHESIS | Used only as a labelled ASSUMPTION for an ordinal upside level; no external CTR curve is used — CTR is compared only to the business's own observed site CTR |

---

## 1. Scope

M5 answers: *given what the system knows now (approved Search Universe, M4 topic intelligence, page inventory, GEO readiness, baseline), which evidence-backed opportunities may deserve action?*

- Deterministic detection of opportunity **candidates** from existing M3/M4 data.
- Transparent, configurable scoring → priority band + confidence + effort (labelled).
- Evidence embedded in every opportunity with references to the source documents.
- Explicit **NO_ACTION / WAIT_FOR_DATA** evaluations per approved topic.
- Deduplication and a lifecycle that preserves owner decisions across runs.
- Tie to the current intelligence run and baseline.
- Minimal inspection UI (פעולות → הזדמנויות).

## 2. Non-scope (M6–M9)

- SearchIntent object, canonical ownership, cannibalization engine (M6).
- Final CREATE / IMPROVE / CONSOLIDATE / WAIT / MONITOR / REJECT decisions (M6). M5 lists *candidate* actions only.
- ImpactPrediction, SEOChangeEvent, SEOExperiment, churn prevention (M7), measurement (M8), learning (M9).
- Any new external provider call. No task creation. No change to M3/M4 data.

## 3. Gap analysis — can M5 be built without new providers?

**Yes.** Everything M5 needs for a first, honest version exists:

| Need | Source (existing) | Basis |
|---|---|---|
| Business relevance | `searchTopics.status` (owner), `topicIntelligence.business.linkedServices` | observed (owner decision) |
| Current visibility, position, CTR, pages per topic | `topicIntelligence.gscCurrent` (governed GSC query × page) | observed |
| Site CTR reference | `intelligenceRuns.businessContext.searchConsole` | observed |
| Page coverage | `topicIntelligence.pages.observed` / `.contentMatched` | observed / inferred |
| Technical state | `seoPages` (indexability, canonical, robots, links, diagnostics) | observed (crawl-derived) |
| Entity / fact clarity | `intelligenceRuns.geoReadiness.signals` | observed |
| Commercial value | `topicIntelligence.business.preliminaryIntent`, commercial modifier | inference |
| Baseline | `baselines` (immutable) | observed |

**Missing (represented as unknown, never fabricated):**

- External demand / volume / difficulty — Semrush live discovery deferred (§34.1). Demand falls back to *observed* GSC impressions (a floor, not market demand).
- Demand trend — only one 28-day query × page window exists; no history yet.
- SERP features / competitors — no SERP provider.
- Page-level traffic and conversions — no governed GA4 landing-page report.
- Entity graph — not built (M6+).
- GSC rows beyond 1,000 per period — M4 row limit (could be raised to 25,000; follow-up).

None of these block M5; each lowers confidence where relevant and is listed in the opportunity's `missing[]`.

## 4. Opportunity model

M5 **extends the existing `opportunities` collection** (manual opportunities, owner-managed). No parallel collection. Engine opportunities are marked `source: "opportunity_engine"`; manual ones keep working unchanged.

```text
opportunities/{businessId}_{dedupeKey}
  businessId
  source: "opportunity_engine"
  dedupeKey                  // see §7
  type                       // see §5
  title, description         // plain Hebrew, generated from the evidence
  candidateActions[]         // MASTER §20 vocabulary — candidates, not decisions
  targetTopicIds[], targetQueryFamilyIds[] (= topic ids in M3.2), targetPageKeys[], targetEntityIds[] (empty until M6)
  signals: { businessRelevance, commercialValue, demand, visibility, technical, content, entity, geo }   // levels + basis
  factors[]                  // scoring breakdown: key, level, weight, contribution, basis, explanation
  score, priority (high|medium|low), confidence (high|medium|low) + confidenceReasons[]
  estimatedEffort { level, basis: "assumption" }
  estimatedValue  { level, basis, note }   // ordinal, never a promised number
  evidence[]                 // §6
  missing[]                  // what is unknown
  status                     // OWNER field (existing enum) — engine sets "new" only on first creation
  engineState: active | resolved
  firstDetectedAt(Ms), lastDetectedAt(Ms), lastEvaluatedAt(Ms), detectionCount
  sourceRunId, firstSourceRunId, opportunityRunId
  baselineId, baselineMatchesRun
  impactInputs { targetType, targetId, baselineId, current metrics, period }   // inputs for future ImpactPrediction (M7) — no prediction
  decisionId: null           // M6 placeholder
  analysisVersion, modelVersion (engine version), configVersion
  priority (existing field reused: high|medium|low), topic (title, existing field), relatedPage (first page URL, existing field)
```

## 5. Taxonomy (minimal viable)

M5 detects **opportunity kinds**; each maps to MASTER §20 candidate actions. M6 decides.

| Type | Detected when (all deterministic) | Candidate actions |
|---|---|---|
| `technical_blocker` | A page that serves an approved topic (observed in GSC or content-matched) **or** has its own GSC impressions is, per the crawl, non-indexable, robots-blocked, or has a conflicting / elsewhere-pointing canonical | IMPROVE_PAGE, DEINDEX_NOINDEX_REVIEW (confirm the blocker is unintended) |
| `ranking_upside` | Approved topic with an observed page whose impression-weighted position is 4–20 and impressions above the business's own floor | IMPROVE_PAGE, UPDATE_CONTENT, ADD_INTERNAL_LINKS |
| `ctr_upside` | Approved topic with average position ≤ 10, meaningful impressions, and CTR well below the **site's own** CTR | IMPROVE_PAGE (title/description) |
| `coverage_gap` | Approved, business-relevant topic with **no** observed page and **no** content-matched page | CREATE_PAGE, IMPROVE_PAGE (extend an existing page) — M6 chooses |
| `page_not_visible` | Approved topic with a content-matched page (inferred) but no GSC visibility for its queries | IMPROVE_PAGE, REWORK_INTENT, WAIT_FOR_DATA |
| `internal_linking` | A page that serves an approved topic has **no** inbound internal link from the crawled pages | ADD_INTERNAL_LINKS |
| `page_overlap_observed` | More than one page observed in GSC for the same approved topic | MONITOR, CONSOLIDATE_PAGES (review in M6) — explicitly *not* a cannibalization verdict |
| `entity_clarity` | Site-level GEO readiness signal (identity, services, locations, contact, fact consistency) is missing/partial | ADD_ENTITY_COVERAGE, ADD_STRUCTURED_DATA (Organization/LocalBusiness only; never FAQ) |

Topic outcomes that are **not** opportunities (stored on the run, not in the list):

- `NO_ACTION` — topic evaluated, nothing met any rule (e.g. already top-3 with healthy CTR and a healthy page).
- `WAIT_FOR_DATA` — not enough evidence to judge (e.g. GSC unavailable and no page/demand evidence).

Deliberately **not** in M5: freshness/content-decay (needs history), localization (needs locale demand), REDIRECT, ADD_SOURCE/EVIDENCE (needs content analysis), competitor gaps (no SERP data).

## 6. Evidence model (MASTER §22)

Embedded in each opportunity (no separate collection yet — ADR 3):

```text
evidence[] = {
  id            // stable: "<collection>/<docId>#<field>"
  sourceType    // search_console | crawl | owner_decision | service_map | geo_readiness | baseline | semrush
  sourceRef     { collection, docId, field }
  observation   // human-readable fact, e.g. "position 8.4, 120 impressions (2026-09-08 – 2026-10-05)"
  basis         // observed | inference | assumption | hypothesis
  capturedAtMs
}
```

Trace: `Opportunity → factors/signals → evidence → sourceRef → originating document`. A future `evidence` collection (M6) can be materialized from these ids without changing opportunities.

## 7. Deduplication

`dedupeKey = sha256(businessId | type | sorted(topicIds) | sorted(pageKeys) | signalKey)` (first 20 hex). The document id is `{businessId}_{dedupeKey}`, so the same situation found again **updates** the same document (detection count, evidence, scores) instead of creating a duplicate. Two different types on the same page/topic are different opportunities (e.g. a technical blocker and an internal-linking gap). The same page serving two topics with the same issue (e.g. a blocker) is deduped on the page, listing both topics.

## 8. Lifecycle

Two independent fields:

- `status` — **owner's** decision (existing enum: new, researching, approved, in_progress, completed, rejected, monitoring). The engine writes `"new"` only when it first creates a document and **never changes it afterwards**. `rejected` is a durable negative signal: re-detection keeps it rejected (MASTER §43.18).
- `engineState` — the **system's** view: `active` (detected in the latest run) or `resolved` (not detected in the latest run; kept, never deleted).

## 9. Scoring model (explainable, no fake precision)

Ordinal levels 0–3 per factor; `null` = unknown (excluded from the score, lowers confidence).

| Factor | Level rule | Basis |
|---|---|---|
| `businessRelevance` | owner status priority / brand_strategic = 3; relevant = 2; +1 (max 3) if linked to a confirmed service; site-level = 2 | observed (owner) |
| `commercialValue` | preliminary intent commercial / local or commercial modifier = 3; navigational = 2; informational = 1; unclassified = null | inference |
| `demand` | GSC impressions tier **relative to this business's approved topics** (top third = 3, middle = 2, lower = 1, none observed = 0); Semrush volume used when present | observed |
| `upside` | type-specific: blocker on a visible page = 3; position 4–10 = 3, 11–20 = 2; CTR < 50 % of site CTR = 3; coverage gap = 2; … | observed + assumption (position tiers) |
| `effortInverse` | technical / CTR / internal links = 3 (small), ranking/content/entity = 2, new page / overlap review = 1 | assumption |

`score = Σ weight × level` over known factors, normalized to 0–100 for sorting only. **Priority** = band from the score (high ≥ 65, medium ≥ 40, else low), with two guards: technical blockers on a visible or approved-topic page are at least medium; overlap observations are capped at low (monitor). The UI shows the band and the factor list, not the number. Weights live in `functions/opportunityConfig.js` (versioned) and can be overridden per business via `businesses.opportunityWeights` (known keys only).

**Confidence** (separate from priority): starts high; −1 per: GSC current data not available for the target, a key factor unknown, the main page evidence is inferred, the target page was not crawled in the latest run, no baseline. high / medium / low with the reasons listed.

## 10. Relationship to the M4 baseline

Each run records the latest baseline id and whether it was captured from the same intelligence run (`baselineMatchesRun`). Each opportunity stores `baselineId` and `impactInputs` (target, current metrics, period) so a future ImpactPrediction can reference `baseline_snapshot_id` without recomputation. Baselines are only read, never written.

## 11. Relationship to M6

M5 output = candidates with evidence. M6 consumes them: builds the SearchIntent object, resolves ownership and cannibalization, and turns `candidateActions[]` into one decision (`decisionId` placeholder). `page_overlap_observed` and `coverage_gap` are the main M6 inputs; M5 never states ownership.

## 12. API / caching / governance

- **No provider calls.** M5 reads Firestore only (inputs written by M3.2/M4). It cannot spend money or quota.
- Deterministic analysis cache (MASTER §32): `inputHash = hash(engineVersion, configVersion, weights, sourceRunId, baselineId, approved topics + owner statuses, owner opportunity statuses, topicIntelligence ids+computedAt, seoPages pageKeys+lastCrawledAt)`. If the latest `opportunityRuns` row has the same hash, the run returns `cache_hit` and writes nothing else. Timestamps of the request itself are not part of the hash.
- Triggered only by an explicit owner action (`visibilityRunOpportunityEngine`); never on render.
- Rules: engine-written fields are protected — clients may update only `status` / `updatedAt` / owner notes on engine opportunities and may not create them; `opportunityRuns` is read-only for clients.

## 13. UI (minimal inspection)

פעולות → הזדמנויות: a "הזדמנויות שהמערכת זיהתה" section with the run button, counts, a compact list (priority, type, title, target, confidence, owner status select) and an expandable row: why it appeared (factors), evidence, candidate actions, baseline, what's missing. Topics with no action are summarized from the run. Manual opportunities stay below, unchanged. No polish — final UX after M9.

## 14. Test strategy

Deterministic, index-enforcing fake Firestore (`functions/test/opportunityEngine.test.js`): creation per type, dedupe across runs, evidence linkage, scoring and band ordering, confidence reductions, NO_ACTION / WAIT_FOR_DATA, identical run = cache hit with no writes, changed input = recompute, owner status preserved and rejection durable, resolved marking, no intelligence run / no approved topics / GSC unavailable / page not crawled / zero impressions edge cases, weight override (unknown keys ignored), no provider modules imported and no `apiUsage` rows, boundary (no tasks / decisions / impactPredictions / baselines / searchTopics writes). App: existing no-call-on-render test extended automatically.

## 15. Schema decisions that need care for M6–M9

- Opportunity ids are deterministic → M6 decisions and M7 change events can reference them stably.
- `candidateActions` uses MASTER §20 vocabulary so M6 can map 1:1.
- `impactInputs.baselineId` + target → ImpactPrediction (`baseline_snapshot_id`, `target_type`, `target_id`).
- Owner `status` vs system `engineState` separation → M9 learning can compare system detection with owner acceptance (recommendation acceptance rate, MASTER §37).
- `engineVersion` / `configVersion` on every opportunity → calibration in M9.

---

## Implementation status

See the PR. Decisions taken during implementation are appended below.

### ADR log

1. **Extend `opportunities`, don't add a collection.** One opportunity concept; manual and engine opportunities share the list, distinguished by `source`.
2. **No provider calls in M5.** Demand falls back to observed GSC impressions; Semrush evidence is used only if already stored.
3. **Embedded evidence with stable ids** instead of an `evidence` collection — fewer writes, still traceable; materializable later.
4. **Ordinal factors, band priority.** Avoids false precision; the numeric score is internal.
5. **Owner status is never written after creation.** Lifecycle split into owner `status` and system `engineState`.
6. **NO_ACTION / WAIT_FOR_DATA live on the run**, not as opportunity documents, so the list is never padded.
