# M4 — SEARCH INTELLIGENCE & BASELINE — IMPLEMENTATION BRIEF

**Canonical parent:** `docs/MASTER.md` (§28 Measurement, §29 Technical SEO, §32 Caching, §33 Provider Independence, §34 API Governance, §38.5 Baseline, §39 LLM Website Understanding, §41 M4). Where this brief and MASTER differ, MASTER wins.
**Scope:** M4 only. No M5+ engines.

## 1. Purpose

Turn the approved Search Universe into an intelligence layer that answers, with traceable evidence and without deciding anything:

- what an approved Search Topic represents now, and which queries belong to it;
- what demand signals exist (GSC = current visibility; Semrush = external demand, kept separate);
- which pages currently appear for it (observed) or plausibly relate to it (inferred);
- the current technical SEO state of those pages;
- what GEO-readiness signals the website itself shows;
- what the baseline was before any future optimization;
- how fresh the data is and what is missing.

## 2. Inputs

- **Approved Search Universe (M3.2, read-only):** `searchTopics` with `status ∈ {relevant, priority, brand_strategic}`, their `keywords` (per-source evidence, `seedRefs`, `excludedByRule`), confirmed `businessServices`. Topics in `new`, `unsure` or `exclude` are counted but never analyzed.
- **Own website:** crawled with the existing crawler (up to 50 pages, utility pages skipped with reasons) + `robots.txt` + sitemap.
- **Search Console query × page:** one governed request per run (see §6).
- **Existing snapshots:** latest `searchSnapshots` / `trafficSnapshots` from the daily sync. No new GA4 call.

## 3. Outputs (Firestore, written only by Cloud Functions; read-only for clients)

| Collection | Content |
|---|---|
| `seoPages/{businessId}_{hash(pageKey)}` | Latest observed state of each crawled page: HTTP status, title, description, H1/H2, word count, indexability (crawl-derived) + reasons, canonical (valid / missing / conflicting / points_elsewhere / unknown), robots (crawlable / blocked / unknown), sitemap (present / absent / unknown), structured data (present / missing / invalid + types), internal links in/out (within the crawled set), orphan state (scoped), inferred page role, diagnostics (observations, not tasks). Pages not fetched in a later run keep their last observation, marked `failed_last_run` / `not_crawled_last_run`. |
| `topicIntelligence/{businessId}_{topicId}` | Per approved topic: query count/queries, source mix, `gscCurrent` (query × page: impressions, clicks, CTR, impression-weighted position, ranking distribution, per-query and per-page rows, `multiplePagesObserved`), `gscDiscovery` (M3.2 90-day evidence), `semrush` (or `not_available`), pages `observed` vs `contentMatched` (inferred), technical context of associated pages, business linkage (services, geography, preliminary intent, commercial signal), SERP context (`not_available`), emergence, source confidence, `missing[]`. Topics that lose approval are marked `superseded`, never deleted. |
| `intelligenceRuns/{id}` | One per run: approved inputs, crawl report + robots, GSC decision (cache/miss/blocked, providerCalled, period, rows, truncation flag), business context from snapshots, GEO readiness, Semrush/SERP availability, project summary. |
| `baselines/{businessId}_v{n}` | Immutable versioned snapshot (§5). |

`businesses.baselineDate` / `latestBaselineId` become pointers to the latest baseline (set server-side).

## 4. SEO intelligence model

Technical SEO is a diagnostic layer (MASTER §29): observed states plus `diagnostics[]` codes (`non_indexable`, `canonical_missing`, `canonical_conflicting`, `canonical_points_elsewhere`, `blocked_by_robots`, `not_in_sitemap`, `structured_data_missing`, `structured_data_invalid`, `title_missing`, `title_duplicate`, `meta_description_missing`, `meta_description_duplicate`, `h1_missing`, `h1_multiple`, `no_inbound_from_crawled_pages`, `underlinked_candidate` (inferred)). No task is created from any of them.

Honesty rules: indexability is crawl-derived (Google's index status is not verified); link counts and orphan state are scoped to the crawled pages; no JS rendering; an unavailable input yields `unknown` with a reason.

## 5. Baseline model (MASTER §38.5)

- Captured only on explicit owner request (`visibilityCaptureBaseline`, Overview or Intelligence tab).
- **Immutable:** document id `{businessId}_v{n}`, created with a create-only write (fails if it exists); Firestore rules deny every client create/update/delete; no code path updates a baseline.
- **Refresh = new version** (`previousBaselineId`, `contentHash`, `identicalToPrevious`).
- Content: periods (GSC query × page, search snapshot, traffic), business-level GSC and GA4 context (incl. organic sessions), per-topic GSC metrics + ranking distribution + ranking pages + Semrush status + query list, per-page technical state, technical summary, GEO readiness, SERP context (`not_available`), `availability` map.
- Future references (ImpactPrediction `baseline_snapshot_id`, SEOChangeEvent `before_snapshot_id`): `baselineId` + target type (`business` | `topic` | `page`) + target id (`topicId` | `pageKey`), listed in `referenceKeys`.

## 6. Provider boundaries and governance

| Provider | M4 use |
|---|---|
| Own website | Crawl (same crawler as M3.1; not a paid provider) |
| Google Search Console | **One** query × page request per run via `runGoverned` (`google.searchConsoleQueryPage`): cache identity = site + period + dimensions + row limit + analysis version; 12 h TTL; per-business/global daily and monthly request limits; circuit breaker; fail closed; ledger with `actualCostUsd: 0`. Period = 28 days ending 3 days ago (final data; stable for a day). |
| GA4 | Existing daily snapshots only. Page-level traffic: `not_available` (would need a new governed GA4 report — deferred). |
| Semrush | Not called. Existing M3.2 evidence on keywords is used if present; otherwise `not_available`. |
| SERP | No provider → `not_available`. |
| LLM | Not used in M4. |

Nothing runs on render, navigation or deploy (enforced by `app/test/noProviderCallOnRender.test.ts`).

## 7. GEO intelligence boundary

M4 measures **GEO readiness** — website signals only: business identity, explicit services, explicit service areas, contact details, structured-data coverage, fact consistency (phone numbers), audience/positioning (M3.1 website-verified facets). Each signal: `present | partial | missing | unknown`, observation text, evidence pages, `basis: observed`. It is never labelled AI visibility. External AI monitoring and LLM Website Understanding (MASTER §39) remain later milestones.

## 8. Acceptance criteria

The 20 proofs requested for M4 are covered by `functions/test/searchIntelligence.test.js` (17 cases) plus the existing suites and the app static check; live Hagar acceptance per `docs/M4_IMPLEMENTATION_NOTES.md`.

## 9. Known limitations

- Crawl cap 50 pages; no JS rendering; indexability not verified against Google's index.
- GSC row limit 1,000 per period (flagged when reached); anonymized queries are not returned by GSC.
- Topic ↔ GSC matching is exact on normalized query text (Hebrew morphology limitation inherited from M3.2).
- Content-matched pages are a simple text-containment inference.
- Phone-number consistency is the only automated fact-consistency check.
- Organic traffic is business-level only.

## 10. Explicit M5+ deferrals

Opportunity generation and scoring, Decision Engine, CREATE / IMPROVE, Search Intent object and canonical ownership, cannibalization, ImpactPrediction / Time-to-Impact, SEOChangeEvent / SEOExperiment, measurement and learning, AI visibility monitoring, LLM Website Understanding, content generation, publishing.
