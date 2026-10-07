// M3.1 Service Map tests for functions/serviceMapMerge.js.
// Run with: node functions/test/serviceMapMerge.test.js
//   J  website evidence keeps the real source page (end to end through merge)
//   K  an owner-rejected candidate never silently reappears
//   L  truncated / malformed / non-array AI replies are never a successful
//      analysis, and the error still carries the billed token usage
//   +  owner truth: existing items keep name/description/status/priority;
//      owner facet values are never overwritten; re-running the same
//      proposals (a free cache hit) creates no duplicates

const assert = require("assert");
const path = require("path");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { parseAiServiceReply, mergeProposals } = require(path.join(__dirname, "..", "serviceMapMerge.js"));
const { buildPageCorpus, ownerFacets } = require(path.join(__dirname, "..", "serviceFacets.js"));
const { tokenize } = require(path.join(__dirname, "..", "textSimilarity.js"));

const W = "https://www.hagarlushi.com";
const corpus = buildPageCorpus([
  { url: `${W}/`, title: "Hagar Lushi", metaDescription: "", headings: ["אדריכלות ועיצוב פנים ללקוחות פרטיים"], bodyText: "" },
  { url: `${W}/לקוחות-פרטיים`, title: "פרטיים", metaDescription: "", headings: ["אדריכלות ועיצוב פנים ללקוחות פרטיים"], bodyText: "כל פרויקט מתחיל בהקשבה" },
  { url: `${W}/מסחריים`, title: "מסחריים", metaDescription: "", headings: ["אדריכלות ועיצוב פנים לעסקים"], bodyText: "פרויקטים מסחריים" }
]);

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
  }
}

async function setupMap(items) {
  const fake = createFakeFirestore();
  const db = fake.admin.firestore();
  const known = [];
  for (const it of items) {
    const ref = await db.collection("businessServices").add({ businessId: "b1", ...it });
    known.push({ id: ref.id, name: it.name, source: it.source, ownerStatus: it.ownerStatus, facets: it.facets || null, facetsVersion: it.facetsVersion || 0, tokens: tokenize(it.name) });
  }
  return { fake, db, known };
}
const merge = (ctx, proposals) =>
  mergeProposals({ db: ctx.db, businessId: "b1", known: ctx.known, proposals, corpus, inputHash: "hashX", now: "NOW", verifiedAt: "2026-10-07T12:00:00.000Z", facetsVersion: 3 });

(async () => {
  await test("J website evidence keeps the page the quote is really on", async () => {
    const ctx = await setupMap([]);
    await merge(ctx, [
      {
        name: "אדריכלות לעסקים",
        facets: { services: [{ value: "אדריכלות", url: `${W}/מסחריים` }], markets: [{ value: "פרויקטים מסחריים", url: `${W}/` }] },
        evidence: [
          { quote: "אדריכלות ועיצוב פנים לעסקים", url: `${W}/` }, // AI cited the homepage; text is only on /מסחריים
          { quote: "כל פרויקט מתחיל בהקשבה", url: `${W}/לקוחות-פרטיים` }
        ]
      }
    ]);
    const row = ctx.fake.rows("businessServices")[0];
    assert.strictEqual(row.evidenceSources[0].sourceUrl, `${W}/מסחריים`, "corrected to the page the quote is actually on");
    assert.strictEqual(row.evidenceSources[1].sourceUrl, `${W}/לקוחות-פרטיים`);
    assert.deepStrictEqual(row.sourceUrls, [`${W}/מסחריים`, `${W}/לקוחות-פרטיים`], "multiple source pages preserved");
    assert.strictEqual(row.evidenceSources[0].provenance, "website");
    assert.strictEqual(row.evidenceSources[0].analysisInputHash, "hashX");
    assert.strictEqual(row.evidenceSources[0].verifiedAt, "2026-10-07T12:00:00.000Z");
    assert.strictEqual(row.facets.markets[0].sourceUrl, `${W}/מסחריים`, "facet value credited to the real page, not the cited homepage");
    assert.strictEqual(row.ownerStatus, "needs_review");
    assert.strictEqual(row.source, "ai_inference");
  });

  await test("K an owner-rejected candidate does not reappear (exact name or close variant)", async () => {
    const ctx = await setupMap([{ name: "עיצוב גרפי", source: "ai_inference", ownerStatus: "rejected", facetsVersion: 3 }]);
    const before = JSON.stringify(ctx.fake.rows("businessServices"));
    const r = await merge(ctx, [
      { name: "עיצוב גרפי", existingName: "עיצוב גרפי", evidence: [{ quote: "x", url: `${W}/` }] },
      { name: "עיצוב גרפי למותגים", evidence: [] } // close variant (token overlap ≥ threshold)
    ]);
    assert.strictEqual(r.proposed, 0, "nothing new created");
    assert.strictEqual(r.merged, 0, "rejected item not modified");
    assert.strictEqual(r.skippedRejected, 2);
    assert.strictEqual(JSON.stringify(ctx.fake.rows("businessServices")), before, "Service Map unchanged");
  });

  await test("owner truth: existing item keeps name/description/status/priority and owner facets", async () => {
    const ctx = await setupMap([
      { name: "אדריכלות", description: "מה שבעלת העסק כתבה", source: "owner", ownerStatus: "confirmed", priority: "high", facets: ownerFacets("אדריכלות", ["קיסריה"]), facetsVersion: 3 }
    ]);
    await merge(ctx, [
      {
        name: "אדריכלות מגורים",
        existingName: "אדריכלות",
        description: "AI description",
        facets: { services: [{ value: "אדריכלות", url: `${W}/` }], geographies: [{ value: "חיפה" }], markets: [{ value: "מגורים" }] },
        evidence: [{ quote: "אדריכלות ועיצוב פנים ללקוחות פרטיים", url: `${W}/לקוחות-פרטיים` }]
      }
    ]);
    const row = ctx.fake.rows("businessServices")[0];
    assert.strictEqual(row.name, "אדריכלות");
    assert.strictEqual(row.description, "מה שבעלת העסק כתבה");
    assert.strictEqual(row.ownerStatus, "confirmed");
    assert.strictEqual(row.priority, "high");
    assert.strictEqual(row.source, "combined");
    assert.strictEqual(row.facets.services[0].provenance, "owner", "owner facet value not overwritten by AI");
    assert.ok(row.facets.geographies.some((g) => g.value === "קיסריה" && g.provenance === "owner"));
    assert.ok(row.facets.markets.length === 1, "AI adds a new dimension alongside owner values");
  });

  await test("re-running the same proposals (free cache hit) creates no duplicates", async () => {
    const ctx = await setupMap([]);
    const proposals = [{ name: "שיפוץ קומפלט", evidence: [{ quote: "פרויקטים מסחריים", url: `${W}/מסחריים` }] }];
    await merge(ctx, proposals);
    const r2 = await merge(ctx, proposals);
    assert.strictEqual(r2.proposed, 0);
    assert.strictEqual(r2.merged, 1);
    const rows = ctx.fake.rows("businessServices");
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].evidenceSources.length, 1, "evidence replaced, not appended");
  });

  await test("M owner-renamed item is still recognized - the AI's original name does not come back", async () => {
    // Owner renamed the AI item "שיפוץ קומפלט" to "שיפוץ דירות מקיף"; the
    // saved (cached) AI answer still uses the original name.
    const ctx = await setupMap([
      { name: "שיפוץ דירות מקיף", aliases: ["שיפוץ קומפלט"], source: "ai_inference", ownerStatus: "confirmed", priority: "high", facetsVersion: 3 }
    ]);
    ctx.known[0].aliases = ["שיפוץ קומפלט"];
    const r = await merge(ctx, [{ name: "שיפוץ קומפלט", existingName: null, evidence: [{ quote: "פרויקטים מסחריים", url: `${W}/מסחריים` }] }]);
    assert.strictEqual(r.proposed, 0, "no new item for the renamed one");
    assert.strictEqual(r.merged, 1);
    const rows = ctx.fake.rows("businessServices");
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].name, "שיפוץ דירות מקיף", "owner's new name kept");
    assert.strictEqual(rows[0].ownerStatus, "confirmed");
  });

  await test("M2 a renamed-then-rejected item stays out under its original name", async () => {
    const ctx = await setupMap([{ name: "שם חדש לגמרי", aliases: ["עיצוב גרפי"], source: "ai_inference", ownerStatus: "rejected", facetsVersion: 3 }]);
    ctx.known[0].aliases = ["עיצוב גרפי"];
    const r = await merge(ctx, [{ name: "עיצוב גרפי", evidence: [] }]);
    assert.strictEqual(r.proposed, 0);
    assert.strictEqual(r.skippedRejected, 1);
  });

  const ok = { ok: true, statusText: "OK" };
  const usage = { input_tokens: 10377, output_tokens: 12000 };

  await test("L1 truncated reply (stop_reason max_tokens) is an error, never a result", async () => {
    assert.throws(
      () => parseAiServiceReply(ok, { id: "m1", stop_reason: "max_tokens", usage, content: [{ text: '[{"name":"אדר' }] }, 12000),
      (err) => /cut off/.test(err.message) && err.usage.inputTokens === 10377 && err.usage.outputTokens === 12000
    );
  });

  await test("L2 malformed JSON is an error carrying billed usage", async () => {
    assert.throws(
      () => parseAiServiceReply(ok, { id: "m2", stop_reason: "end_turn", usage, content: [{ text: '[{"name": "x",,]' }] }, 12000),
      (err) => /Could not parse/.test(err.message) && err.usage.requestId === "m2"
    );
  });

  await test("L3 valid JSON that is not an array is an error", async () => {
    assert.throws(() => parseAiServiceReply(ok, { stop_reason: "end_turn", usage, content: [{ text: '{"name":"x"}' }] }, 12000), /not a JSON array/);
  });

  await test("L4 provider HTTP error is an error", async () => {
    assert.throws(() => parseAiServiceReply({ ok: false, statusText: "Unauthorized" }, { error: { message: "invalid x-api-key" } }, 12000), /invalid x-api-key/);
  });

  await test("L5 complete reply (incl. stray prose around the array) parses", async () => {
    const r = parseAiServiceReply(ok, { id: "m5", stop_reason: "end_turn", usage, content: [{ text: 'Here:\n[{"name":"אדריכלות"}]\nDone' }] }, 12000);
    assert.deepStrictEqual(r.proposals, [{ name: "אדריכלות" }]);
    assert.strictEqual(r.usage.outputTokens, 12000);
  });

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL"));
  console.log(failed.length ? `\n${failed.length} Service Map test(s) FAILED.` : "\nAll Service Map merge/parse tests passed.");
  process.exit(failed.length ? 1 : 0);
})();
