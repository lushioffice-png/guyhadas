# M4 Search Intelligence & Baseline — Implementation Notes

**`docs/MASTER.md` is canonical.** This file records how M4 was implemented and why; contract: `docs/M4_IMPLEMENTATION_BRIEF.md`.

## Pre-coding matrix (main @ 3aadc0b)

A = already correct · B = missing · C = incorrect · D = documentation/configuration only · E = future scope

| Area | Class | Finding → action |
|---|---|---|
| Approved Search Universe as input | A | Read-only; never written by M4 |
| GSC query-level data | A (partial) | `searchSnapshots` (28 d, top 20 queries) + M3.2 90-day discovery metrics — reused as separate evidence |
| GSC query × page | B | Required to say which pages appear per topic → one new Google request, governed (`google.searchConsoleQueryPage`) |
| GA4 context | A | Existing `trafficSnapshots`; no new GA4 call; page-level traffic `not_available` |
| Crawler | A + extend | `crawlSite` reused; additive status / X-Robots-Tag / sitemap keys; higher cap for the inventory |
| Page inventory, technical SEO | B | `pageInventory.js`, `seoPages` |
| Topic intelligence | B | `topicIntelligence.js`, `topicIntelligence` |
| Baseline | C | Was a mutable date (`businesses.baselineDate`, overwritten by "update baseline to today") → immutable versioned `baselines`; the date becomes a server-set pointer |
| GEO readiness | B | `geoReadiness.js`, website signals only |
| SERP context | B → D | No provider: represented as `not_available` |
| Semrush | D | Unchanged; no M4 call |
| UI | B | New "מודיעין חיפוש" tab; Overview baseline button now captures a version |
| Opportunity, decision, intent ownership, cannibalization, ImpactPrediction, AI monitoring | E | Not built |

Must remain untouched: M3.2 pipeline and Topics tab, Semrush adapter and limits, existing GA4/GSC sync, Calendar/email functions.

## Decisions (ADR log)

1. **GSC query × page is the one new provider call, and it is governed.** Without it the system cannot say which pages appear for a topic. It runs through `runGoverned` like Anthropic/Semrush (cache first, fail closed, quotas, circuit breaker, ledger). This is the first Google call under the governor; the rest of the Google gap (MASTER §34/§42) is unchanged and not widened.
2. **Stable analysis period.** 28 days ending 3 days ago (`dataState: final`): the input — and so the cache identity — changes once a day; re-runs within the day are $0 cache hits; the TTL (12 h) bounds staleness.
3. **No new GA4 call.** Organic traffic is business-level context from existing snapshots; page-level traffic is explicitly `not_available`.
4. **One baseline concept.** The M2 `baselineDate` (a mutable date) is not a baseline under MASTER §38.5. M4 baselines are immutable, create-only, versioned documents; `baselineDate`/`latestBaselineId` are set server-side as pointers so existing Traffic/Search charts keep working. No parallel subsystem.
5. **Baselines are business-scoped documents with per-topic and per-page entries** (`referenceKeys`) rather than one document per target: one atomic snapshot in time, referenceable later as `baselineId + targetType + targetId`.
6. **Observed vs inferred everywhere.** Pages that appear in GSC are `observed`; pages whose text contains the topic title are `contentMatched` (`inferred`); multiple observed pages are recorded as a fact (`multiplePagesObserved`), never a cannibalization verdict.
7. **Latest-state docs + history in baselines.** `seoPages` and `topicIntelligence` hold the latest observation (marked stale/superseded instead of deleted); history lives in immutable baselines and in `intelligenceRuns`.
8. **GEO readiness ≠ AI visibility.** Deterministic website signals with evidence pages; no LLM, no external AI system queried.
9. **Client-read-only collections.** `seoPages`, `topicIntelligence`, `intelligenceRuns` writable only by the Admin SDK; `baselines` deny create/update/delete to clients.

## Components

Reused: `crawlSite` (extended additively), `runGoverned` / `apiUsage` ledger, `apiLimits`, `normalizePhrase`, `requireAdmin` / CORS, existing snapshots, UI primitives (Badge, StatCard, record cards, evidence lists).

New (functions): `pageInventory.js`, `topicIntelligence.js`, `geoReadiness.js`, `googleSearchConsole.js` (adapter), `searchIntelligenceStore.js` (core), `searchIntelligence.js` (HTTP: `visibilityRunSearchIntelligence`, `visibilityCaptureBaseline`), `apiLimits.google.searchConsoleQueryPage`.
New (app): `BusinessIntelligence.tsx` (route `intelligence`), types, listeners, function clients; Overview baseline button → `captureBaseline`.

No new composite indexes (all new queries are equality-only; sorting is in memory).

## Test evidence

`functions`: 8 suites green (`npm test`), including `test/searchIntelligence.test.js`:

| Required proof | Test |
|---|---|
| 1–2 approved topics only | "only approved Search Topics are analyzed" |
| 3–4 GSC ≠ Semrush, provenance intact | "GSC and Semrush stay distinct…" (raw keyword rows byte-identical after a run) |
| 5–6 only fetched pages; honest failures | "inventory holds only fetched pages…" |
| 7 deterministic technical state | "technical state is observed and deterministic"; "unknown when the input was not available" |
| 8–10 immutable, versioned, reference-ready baselines | "baselines are immutable, versioned, and reference-ready"; "baseline without any intelligence run…" |
| 11 identical analysis → cache hit $0 | "identical run reuses the governed GSC result at $0" |
| 12 changed input → miss | "changed analysis period is a cache miss" |
| 13 fail closed | "cache lookup failure fails closed…"; "quota exhausted…"; "GSC not connected…" |
| 14 no call on render | `app/test/noProviderCallOnRender.test.ts` (now 16 callables, 11 page effects) |
| 15–16 no side effects, owner status unchanged | "no tasks/opportunities/pages created; owner status untouched" |
| 17 GEO readiness evidence-based | "GEO readiness is evidence-based…" |
| 18 SERP/Semrush not fabricated | "SERP and Semrush context are not_available…" |
| 19–20 regressions, build | all M3.x suites; `tsc -b && vite build` |

## Live Hagar acceptance

Pending deploy (`functions`, `hosting:app`, `firestore:rules`). Checklist:

1. Intelligence tab → "הרצת ניתוח": completes; GSC decision shown; crawl counts; robots.txt read.
2. Approved topics show real GSC impressions/clicks/position with periods; expanding shows observed pages (real URLs), queries, Semrush "not available", what is missing.
3. Page table: real crawled URLs, indexability/canonical/sitemap/structured-data states consistent with the live HTML (spot-check two pages in the browser's view-source).
4. GEO readiness: signals with evidence pages; no "AI visibility" wording.
5. Run again → GSC "cached result, no new request".
6. Baseline: save v1, save v2 → both listed, v1 unchanged; Overview shows the latest date; Traffic/Search charts still mark it.
7. No tasks/opportunities; `apiUsage` shows no Semrush row; nothing runs on page load.

## Known gaps

See the brief §9. Plus: GA4/other Google ingestion still ungoverned (MASTER §34/§42); baselines are capped at 200 topics / 100 pages per document.
