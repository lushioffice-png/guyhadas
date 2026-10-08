// M3.2 Search Universe tests - seed builder, governed Semrush discovery,
// GSC evidence, filtering, normalization, topics, qualification.
// Runs against the index-enforcing in-memory Firestore (helpers/fakeFirestore.js)
// with the Semrush adapter replaced by a counting fake (no network).
// Run with: node functions/test/searchUniverse.test.js

const assert = require("assert");
const path = require("path");
const { createFakeFirestore, loadWithFake } = require("./helpers/fakeFirestore");
const { buildSeeds, normalizePhrase } = require("../seedBuilder");
const { qualifyTopic, buildQualificationContext } = require("../topicQualification");

const STORE = path.join(__dirname, "..", "searchUniverseStore.js");
const SEMRUSH = path.join(__dirname, "..", "semrush.js");
const BIZ = "hagar";

const fv = (value, provenance, pages = []) => ({ value, provenance, sourceUrl: pages[0] || null, foundOn: pages });

// A Hagar-shaped Service Map: owner service area קיסריה, project-only
// locations געתון / כפר ביאליק found on a single page each, an English
// owner market, a rejected item and an unreviewed AI proposal.
function hagarServices() {
  return [
    {
      id: "svcArch",
      businessId: BIZ,
      name: "אדריכלות למגורים",
      ownerStatus: "confirmed",
      priority: "high",
      source: "owner",
      facets: {
        services: [fv("אדריכלות", "website", ["https://www.x.co.il/a", "https://www.x.co.il/b"])],
        geographies: [fv("קיסריה", "owner"), fv("געתון", "website", ["https://www.x.co.il/געתון"]), fv("כפר ביאליק", "ai_inference", [])],
        projectTypes: [fv("בתים פרטיים", "website", ["https://www.x.co.il/a"])],
        audiences: [fv("משפחות", "ai_inference", [])]
      }
    },
    {
      id: "svcReno",
      businessId: BIZ,
      name: "שיפוץ דירות מקיף",
      ownerStatus: "confirmed",
      priority: "medium",
      source: "combined",
      facets: {
        geographies: [fv("תל אביב", "website", ["https://www.x.co.il/p1", "https://www.x.co.il/p2", "https://www.x.co.il/p3"])]
      }
    },
    { id: "svcRejected", businessId: BIZ, name: "עיצוב משרדים", aliases: ["עיצוב מסחרי"], ownerStatus: "rejected", priority: "low", source: "ai_inference", facets: {} },
    { id: "svcReview", businessId: BIZ, name: "ייעוץ צבעים", ownerStatus: "needs_review", priority: "medium", source: "ai_inference", facets: {} }
  ];
}

const hagarBusiness = { id: BIZ, name: "Hagar Lushi Studio", website: "https://hagarlushi.com", geographicMarkets: ["Caesarea", "קיסריה"] };

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
}

function fakeSemrush() {
  const calls = { related: [], domain: 0, competitors: 0 };
  const related = {
    "אדריכלות למגורים": [
      { query: "אדריכלות למגורים", volume: 90, difficulty: 30, competition: 0.4 },
      { query: "אדריכל למגורים מחיר", volume: 40, difficulty: 25, competition: 0.5 },
      { query: "משרה אדריכלות", volume: 50, difficulty: 10, competition: 0.1 }
    ]
  };
  return {
    calls,
    module: {
      isSemrushConfigured: () => true,
      fetchRelatedKeywords: async (phrase) => {
        calls.related.push(phrase);
        return related[phrase] || [{ query: `${phrase} המלצות`, volume: 10, difficulty: 5, competition: 0.2 }];
      },
      fetchDomainOrganicKeywords: async () => {
        calls.domain++;
        return [{ query: "אדריכלות למגורים", position: 7, volume: 90, difficulty: 30, url: "https://www.x.co.il/a" }];
      },
      fetchOrganicCompetitors: async () => {
        calls.competitors++;
        return [{ domain: "competitor.co.il", relevance: 0.3, commonKeywords: 12 }];
      }
    }
  };
}

async function setup({ services = hagarServices(), business = hagarBusiness, knowledge = [] } = {}) {
  const fake = createFakeFirestore();
  const sem = fakeSemrush();
  const store = loadWithFake(fake, STORE, { [SEMRUSH]: sem.module });
  const db = fake.admin.firestore();
  await db.collection("businesses").doc(BIZ).set({ ...business });
  for (const s of services) await db.collection("businessServices").doc(s.id).set({ ...s });
  for (const k of knowledge) await db.collection("businessKnowledge").add({ businessId: BIZ, source: "owner", ...k });
  return { fake, sem, store, db };
}

(async () => {
  // ---------------- Seed construction ----------------
  await test("S1 confirmed owner services create seeds; unconfirmed/rejected do not", async () => {
    const { seeds } = buildSeeds({ business: hagarBusiness, services: hagarServices() });
    const serviceIds = new Set(seeds.map((s) => s.serviceId));
    assert.ok(serviceIds.has("svcArch") && serviceIds.has("svcReno"));
    assert.ok(!serviceIds.has("svcRejected"), "rejected item must not seed");
    assert.ok(!serviceIds.has("svcReview"), "needs_review item must not seed");
    assert.ok(seeds.some((s) => s.kind === "service" && s.phrase === "אדריכלות למגורים"));
  });

  await test("S2 owner service area beats project-only geography", async () => {
    const built = buildSeeds({ business: hagarBusiness, services: hagarServices() });
    const phrases = built.seeds.map((s) => s.phrase);
    assert.ok(phrases.includes("אדריכלות למגורים קיסריה"), "owner area combined");
    assert.ok(!phrases.some((p) => p.includes("געתון")), "single-page project location not seeded");
    assert.ok(!phrases.some((p) => p.includes("כפר ביאליק")), "AI-only location not seeded");
    const skippedGeo = built.skipped.filter((s) => s.reason === "project_location_signal").map((s) => s.value);
    assert.ok(skippedGeo.includes("געתון") && skippedGeo.includes("כפר ביאליק"), "reported as project-location signals");
    assert.ok(built.skipped.some((s) => s.value === "Caesarea" && s.reason === "script_mismatch"), "English market not glued to a Hebrew service");
    assert.ok(phrases.includes("שיפוץ דירות מקיף קיסריה"), "owner profile area applies to every confirmed service");
    assert.ok(phrases.includes("שיפוץ דירות מקיף תל אביב"), "a website area found on >=3 pages is a service-area candidate");
  });

  await test("S3 seed provenance is retained (service, facet dimension, value, provenance)", async () => {
    const { seeds } = buildSeeds({ business: hagarBusiness, services: hagarServices() });
    const geoSeed = seeds.find((s) => s.phrase === "אדריכלות למגורים קיסריה");
    assert.strictEqual(geoSeed.serviceId, "svcArch");
    assert.deepStrictEqual(geoSeed.components.map((c) => [c.dimension, c.value, c.provenance]), [
      ["services", "אדריכלות למגורים", "owner"],
      ["geographies", "קיסריה", "owner"]
    ]);
    assert.ok(geoSeed.explanation.length > 0);
    const mod = seeds.find((s) => s.kind === "service_modifier");
    assert.ok(mod && mod.components[1].provenance === "website", "modifiers only from verified values");
    assert.ok(!seeds.some((s) => s.phrase.includes("משפחות")), "unverified AI audience not used");
  });

  await test("S4 seed caps are deterministic and round-robin by priority", async () => {
    const a = buildSeeds({ business: hagarBusiness, services: hagarServices(), config: { maxSeeds: 3 } });
    const b = buildSeeds({ business: hagarBusiness, services: hagarServices().reverse(), config: { maxSeeds: 3 } });
    assert.deepStrictEqual(a.seeds.map((s) => s.seedKey), b.seeds.map((s) => s.seedKey), "input order does not matter");
    assert.strictEqual(a.seeds.length, 3);
    assert.deepStrictEqual(a.seeds.slice(0, 2).map((s) => s.kind), ["service", "service"], "every service gets its base seed first");
    assert.strictEqual(a.seeds[0].serviceId, "svcArch", "high priority first");
    assert.ok(a.droppedByCap > 0);
  });

  await test("S5 seeds respect owner exclusion rules and rejected names", async () => {
    const services = hagarServices();
    services.push({ id: "svcX", businessId: BIZ, name: "עיצוב פנים", ownerStatus: "confirmed", priority: "low", facets: { services: [fv("עיצוב מסחרי", "website", ["u"])] } });
    const built = buildSeeds({ business: hagarBusiness, services, exclusionRules: ["תל אביב"] });
    assert.ok(!built.seeds.some((s) => s.phrase.includes("תל אביב")));
    assert.ok(built.skipped.some((s) => s.reason === "owner_exclusion_rule"));
    assert.ok(!built.seeds.some((s) => s.phrase === "עיצוב מסחרי"), "a rejected item's alias never becomes a seed");
    assert.ok(built.skipped.some((s) => s.reason === "matches_rejected_service"));
  });

  await test("S6 no LLM / network in seed construction (pure function)", async () => {
    const src = require("fs").readFileSync(path.join(__dirname, "..", "seedBuilder.js"), "utf8");
    assert.ok(!/anthropic|fetch\(|require\("\.\/semrush"\)|firebase-admin/.test(src));
  });

  // ---------------- Discovery / governor ----------------
  const seedKeyOf = async (t, phrase) => t.store.buildSeedsForContext(await t.store.loadDiscoveryContext(BIZ)).seeds.find((s) => s.phrase === phrase).seedKey;

  await test("D1 Semrush seed discovery goes through the governor: miss calls once, identical run is a $0 hit", async () => {
    const t = await setup();
    const key = await seedKeyOf(t, "אדריכלות למגורים");
    const r1 = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.cacheDecision, "cache_miss");
    assert.strictEqual(r1.providerCalled, true);
    assert.strictEqual(t.sem.calls.related.length, 1);
    assert.strictEqual(r1.providerUnitsUsed, 3 * 40);
    const r2 = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    assert.strictEqual(r2.cacheDecision, "cache_hit");
    assert.strictEqual(r2.providerCalled, false);
    assert.strictEqual(t.sem.calls.related.length, 1, "no second provider call");
    const ledger = t.fake.rows("apiUsage");
    assert.ok(ledger.every((r) => r.provider === "semrush" && r.operation === "discoverRelatedForSeed"));
    const hit = ledger.find((r) => r.status === "cache_hit");
    assert.strictEqual(hit.actualCostUsd, 0);
    assert.strictEqual(hit.providerCalled, false);
    assert.strictEqual(t.sem.calls.domain, 0, "seed discovery never re-buys domain data");
  });

  await test("D2 a changed seed is a new governed request", async () => {
    const t = await setup();
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    const r = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים קיסריה") });
    assert.strictEqual(r.cacheDecision, "cache_miss");
    assert.strictEqual(t.sem.calls.related.length, 2);
    const hashes = new Set(t.fake.rows("apiUsage").map((x) => x.inputHash));
    assert.strictEqual(hashes.size, 2);
  });

  await test("D3 a seed not in the confirmed Service Map is refused without any provider call", async () => {
    const t = await setup();
    const r = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: "deadbeefdeadbeef" });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 400);
    assert.strictEqual(t.sem.calls.related.length, 0);
    assert.strictEqual(t.fake.rows("apiUsage").length, 0);
  });

  await test("D4 failed cache lookup fails closed - provider NOT called", async () => {
    const t = await setup();
    const key = await seedKeyOf(t, "אדריכלות למגורים");
    // context load = 2 queries (+1 doc get), then the cache lookup is the next query
    t.fake.failQueriesAfter(2);
    const r = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    t.fake.failQueriesAfter(Infinity);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blockedReason, "blocked_cache_unavailable");
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.providerCalled, false);
    assert.strictEqual(t.sem.calls.related.length, 0);
  });

  await test("D5 quota exhausted blocks the provider; blocked rows don't consume quota", async () => {
    const t = await setup();
    const key = await seedKeyOf(t, "אדריכלות למגורים");
    for (let i = 0; i < 20; i++) {
      t.fake.seed("apiUsage", { provider: "semrush", operation: "discoverRelatedForSeed", businessId: BIZ, status: "success", providerCalled: true, inputHash: `other${i}`, retrievedAtMs: Date.now() - 1000 });
    }
    const r = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.blockedReason, "blocked_by_quota");
    assert.strictEqual(r.status, 429);
    assert.strictEqual(t.sem.calls.related.length, 0);
    const blocked = t.fake.rows("apiUsage").find((x) => x.status === "blocked_by_quota");
    assert.strictEqual(blocked.providerCalled, false);
  });

  await test("D6 force refresh is single-use: it calls once, the next normal run reuses the new result", async () => {
    const t = await setup();
    const key = await seedKeyOf(t, "אדריכלות למגורים");
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    const forced = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key, forceRefresh: true });
    assert.strictEqual(forced.cacheDecision, "forced_refresh");
    assert.strictEqual(t.sem.calls.related.length, 2);
    const next = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: key });
    assert.strictEqual(next.cacheDecision, "cache_hit");
    assert.strictEqual(t.sem.calls.related.length, 2);
  });

  await test("D7 domain discovery is its own governed operation; competitors stored", async () => {
    const t = await setup();
    const r1 = await t.store.discoverSemrushForDomain({ businessId: BIZ });
    assert.strictEqual(r1.cacheDecision, "cache_miss");
    assert.strictEqual(r1.competitorsFound, 1);
    const r2 = await t.store.discoverSemrushForDomain({ businessId: BIZ });
    assert.strictEqual(r2.cacheDecision, "cache_hit");
    assert.strictEqual(t.sem.calls.domain, 1);
    assert.ok(t.fake.rows("apiUsage").every((x) => x.operation === "discoverDomainOrganic"));
    assert.strictEqual(t.fake.rows("competitors").length, 1);
  });

  await test("D8 GSC results stored with metrics + provenance; repeat refreshes, no duplicates", async () => {
    const t = await setup();
    const gsc = (impr) => [{ query: "הגר לושי אדריכלית", metrics: { impressions: impr, clicks: 3, position: 2.1 } }];
    await t.store.storeDiscoveredCandidates(BIZ, gsc(40), { source: "gsc", sourceProperty: "sc-domain:x", report: "q90" });
    await t.store.storeDiscoveredCandidates(BIZ, gsc(55), { source: "gsc", sourceProperty: "sc-domain:x", report: "q90" });
    const kws = t.fake.rows("keywords");
    assert.strictEqual(kws.length, 1);
    assert.strictEqual(kws[0].sources.gsc.metrics.impressions, 55, "evidence refreshed");
    assert.strictEqual(kws[0].sources.gsc.timesSeen, 2);
    assert.strictEqual(kws[0].sources.gsc.sourceProperty, "sc-domain:x");
    assert.strictEqual(t.fake.rows("searchTopics").length, 1);
  });

  // ---------------- Normalization ----------------
  await test("N1 exact duplicate across sources: one keyword, both sources' evidence kept, nothing nulled", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "אדריכלות למגורים", metrics: { impressions: 120, clicks: 4, position: 9 } }], { source: "gsc", sourceProperty: "sc" });
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    const kw = t.fake.rows("keywords").filter((k) => k.query === "אדריכלות למגורים");
    assert.strictEqual(kw.length, 1, "no duplicate keyword row");
    assert.deepStrictEqual(kw[0].sourceList, ["gsc", "semrush"]);
    assert.strictEqual(kw[0].sources.gsc.metrics.impressions, 120, "GSC evidence survives a Semrush hit");
    assert.strictEqual(kw[0].metrics.impressions, 120, "legacy top-level metrics not wiped");
    assert.strictEqual(kw[0].sources.semrush.volume, 90);
    assert.strictEqual(kw[0].seedRefs[0].serviceId, "svcArch", "seed lineage on the raw query");
    const topic = t.fake.rows("searchTopics").find((x) => x.id === kw[0].topicId);
    assert.deepStrictEqual(topic.sources.sort(), ["gsc", "semrush"]);
    assert.strictEqual(topic.sourceCount, 2);
  });

  await test("N2 legacy keyword rows (pre-M3.2) keep their old evidence when re-discovered", async () => {
    const t = await setup();
    const topicRef = await t.db.collection("searchTopics").add({ businessId: BIZ, title: "שיפוץ דירה", queries: ["שיפוץ דירה"], status: "relevant", source: "gsc", addedBy: "system" });
    t.fake.seed("keywords", { businessId: BIZ, topicId: topicRef.id, query: "שיפוץ דירה", source: "gsc", sourceProperty: "sc", metrics: { impressions: 77 }, volume: null });
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "שיפוץ דירה", volume: 500 }], { source: "semrush", sourceProperty: "il", report: "phrase_related" });
    const kw = t.fake.rows("keywords")[0];
    assert.strictEqual(kw.sources.gsc.metrics.impressions, 77);
    assert.strictEqual(kw.sources.semrush.volume, 500);
    assert.strictEqual(kw.metrics.impressions, 77);
    assert.strictEqual(kw.volume, 500);
  });

  await test("N3 near variants merge into one topic; raw queries untouched", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "עיצוב פנים לבית" }, { query: "עיצוב פנים לדירה" }], { source: "gsc" });
    const topics = t.fake.rows("searchTopics");
    assert.strictEqual(topics.length, 1);
    assert.deepStrictEqual(topics[0].queries, ["עיצוב פנים לבית", "עיצוב פנים לדירה"]);
    const kws = t.fake.rows("keywords").map((k) => k.query).sort();
    assert.deepStrictEqual(kws, ["עיצוב פנים לבית", "עיצוב פנים לדירה"]);
    const merged = t.fake.rows("keywords").find((k) => k.query === "עיצוב פנים לדירה");
    assert.strictEqual(merged.grouping.rule, "title_token_overlap");
    assert.strictEqual(merged.grouping.score, 0.5);
  });

  await test("N4 different places never merge (place guard)", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "עיצוב פנים קיסריה" }, { query: "עיצוב פנים תל אביב" }, { query: "עיצוב פנים" }], { source: "gsc" });
    assert.strictEqual(t.fake.rows("searchTopics").length, 3);
  });

  await test("N5 grouping is anchored on the topic title - no drift as a topic accumulates queries", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "שיפוץ מטבח" }, { query: "שיפוץ מטבח קטן" }, { query: "מטבח קטן מעוצב" }], { source: "gsc" });
    const titles = t.fake.rows("searchTopics").map((x) => x.title).sort();
    assert.deepStrictEqual(titles, ["מטבח קטן מעוצב", "שיפוץ מטבח"], "third query matches the accumulated tokens but not the title");
  });

  // ---------------- Filtering ----------------
  await test("F1 owner exclusion rule removes a candidate, keeps the raw query with an auditable reason", async () => {
    const t = await setup({ knowledge: [{ type: "exclusion_rule", content: "משרה" }] });
    const r = await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    assert.strictEqual(r.excluded, 1);
    const kw = t.fake.rows("keywords").find((k) => k.query === "משרה אדריכלות");
    assert.ok(kw, "excluded raw query is preserved");
    assert.strictEqual(kw.topicId, null, "not attached to a reviewable topic");
    assert.strictEqual(kw.excludedByRule.rule, "משרה");
    assert.strictEqual(kw.excludedByRule.reason, "owner_exclusion_rule");
    assert.ok(kw.excludedByRule.ruleId);
    assert.ok(!t.fake.rows("searchTopics").some((x) => x.title.includes("משרה")));
  });

  await test("F2 ambiguous / zero-volume candidates are kept for review", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "בית בעמק", volume: 0 }, { query: "xyz" }], { source: "semrush", sourceProperty: "il" });
    const titles = t.fake.rows("searchTopics").map((x) => x.title).sort();
    assert.deepStrictEqual(titles, ["xyz", "בית בעמק"]);
    assert.ok(t.fake.rows("searchTopics").every((x) => x.status === "new"));
  });

  await test("F3 an owner-excluded topic stays excluded on future discovery (exact and variant)", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "עיצוב משרדים" }], { source: "gsc" });
    const topic = t.fake.rows("searchTopics")[0];
    await t.db.collection("searchTopics").doc(topic.id).update({ status: "exclude" });
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "עיצוב משרדים", metrics: { impressions: 9 } }, { query: "עיצוב משרדים מודרני" }], { source: "gsc" });
    const topics = t.fake.rows("searchTopics");
    assert.strictEqual(topics.length, 1, "no new reviewable topic reappears");
    assert.strictEqual(topics[0].status, "exclude");
    assert.ok(topics[0].queries.includes("עיצוב משרדים מודרני"), "variant recorded under the excluded topic");
  });

  // ---------------- Topics / qualification ----------------
  await test("T1 discovery never changes owner status, never deletes, creates no pages/tasks/opportunities", async () => {
    const t = await setup();
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "אדריכלות למגורים" }], { source: "gsc" });
    const topic = t.fake.rows("searchTopics")[0];
    await t.db.collection("searchTopics").doc(topic.id).update({ status: "priority" });
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    await t.store.discoverSemrushForDomain({ businessId: BIZ });
    assert.strictEqual(t.fake.rows("searchTopics").find((x) => x.id === topic.id).status, "priority");
    for (const c of ["tasks", "opportunities", "pages", "contentAssets"]) assert.strictEqual(t.fake.rows(c).length, 0, c);
  });

  await test("T2 a manual brand/strategic topic with no volume survives discovery untouched", async () => {
    const t = await setup();
    const ref = await t.db.collection("searchTopics").add({ businessId: BIZ, title: "סטודיו הגר לושי", queries: ["סטודיו הגר לושי"], status: "brand_strategic", source: "manual", addedBy: "owner" });
    await t.store.storeDiscoveredCandidates(BIZ, [{ query: "סטודיו הגר לושי", volume: 0 }], { source: "semrush", sourceProperty: "il" });
    const topic = t.fake.rows("searchTopics").find((x) => x.id === ref.id);
    assert.strictEqual(topic.status, "brand_strategic");
    assert.strictEqual(topic.addedBy, "owner");
    assert.deepStrictEqual(topic.sources.sort(), ["manual", "semrush"]);
  });

  await test("T3 qualification is explained and conservative", async () => {
    const ctx = buildQualificationContext({ business: hagarBusiness, services: hagarServices(), knowledge: [{ type: "brand_terminology", content: "הגר לושי" }] });
    // (Hebrew morphology: "אדריכל" would NOT match "אדריכלות" - documented limitation)
    const a = qualifyTopic({ title: "אדריכלות למגורים מחיר", queries: [] }, ctx);
    assert.strictEqual(a.qualification, "likely_relevant");
    assert.strictEqual(a.preliminaryIntent, "commercial");
    assert.ok(a.qualificationReasons.some((r) => r.code === "matches_confirmed_service"));
    const b = qualifyTopic({ title: "עיצוב משרדים בהרצליה", queries: [] }, ctx);
    assert.strictEqual(b.qualification, "possible_mismatch");
    assert.ok(b.qualificationReasons.some((r) => r.code === "matches_rejected_service"));
    const c = qualifyTopic({ title: "הגר לושי", queries: [] }, ctx);
    assert.strictEqual(c.preliminaryIntent, "navigational");
    const d = qualifyTopic({ title: "פרגולות", queries: [] }, ctx);
    assert.strictEqual(d.qualification, "needs_review");
    assert.ok(d.qualificationReasons.some((r) => r.code === "no_confirmed_service_match"));
  });

  await test("T4 discovered topics carry lineage: sources, seedRefs, qualification, lastDiscoveredAt", async () => {
    const t = await setup();
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    const topic = t.fake.rows("searchTopics").find((x) => x.title === "אדריכלות למגורים");
    assert.deepStrictEqual(topic.sources, ["semrush"]);
    assert.strictEqual(topic.seedRefs[0].serviceName, "אדריכלות למגורים");
    assert.ok(topic.qualification && Array.isArray(topic.qualificationReasons));
    assert.ok(topic.lastDiscoveredAt);
    assert.strictEqual(topic.status, "new");
  });

  await test("Q1 every query the pipeline makes is covered by declared indexes", async () => {
    const t = await setup();
    await t.store.discoverSemrushForSeed({ businessId: BIZ, seedKey: await seedKeyOf(t, "אדריכלות למגורים") });
    await t.store.discoverSemrushForDomain({ businessId: BIZ });
    assert.ok(t.fake.queryLog.length > 0); // a missing index would have thrown above
  });

  void normalizePhrase;
  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  if (failed.length) {
    console.error(`\n${failed.length} search-universe test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll search-universe tests passed.");
})();
