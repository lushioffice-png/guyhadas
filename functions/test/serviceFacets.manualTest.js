// Manual verification for functions/serviceFacets.js - same style as
// governorBehavior.manualTest.js (plain Node + assert, no framework).
// Run with: node functions/test/serviceFacets.manualTest.js
//
// Proves the provenance rules don't take the AI's word for anything:
//   1. A facet value that literally appears on a scraped page is
//      "website" with that page's URL (Hebrew prefix letters included).
//   2. A value that doesn't appear anywhere is "ai_inference".
//   3. A URL the AI claims that wasn't actually scraped is dropped.
//   4. Unknown dimensions and empty values are discarded.
//   5. mergeFacets never lets an AI value overwrite an owner value, and
//      upgrades ai_inference -> website when the value is later verified.

const assert = require("assert");
const path = require("path");
const {
  buildPageCorpus,
  sanitizeAiFacets,
  sanitizeAiEvidence,
  ownerFacets,
  mergeFacets
} = require(path.join(__dirname, "..", "serviceFacets.js"));

const pages = [
  {
    url: "https://example.co.il/",
    title: "סטודיו לאדריכלות",
    metaDescription: "עיצוב דירות יוקרה ותכנון בתים פרטיים",
    headings: ["ליווי אישי וניהול פרויקט 360°"],
    bodyText: "אדריכלות ועיצוב פנים לעסקים ופרויקטים מסחריים בקיסריה"
  },
  {
    url: "https://example.co.il/renovation",
    title: "שיפוץ קומפלט",
    metaDescription: "",
    headings: [],
    bodyText: "שיפוץ קומפלט למגורים"
  }
];
const corpus = buildPageCorpus(pages);

// 1-4
const facets = sanitizeAiFacets(
  {
    services: [{ value: "עיצוב פנים", url: "https://example.co.il/" }, { value: "  " }],
    projectTypes: [{ value: "דירות יוקרה", url: "https://not-scraped.example/" }],
    markets: [{ value: "Commercial", url: "https://example.co.il/" }, "מגורים"],
    positioning: ["יוקרה", "יוקרה"],
    madeUpDimension: [{ value: "x" }]
  },
  corpus
);

assert.deepStrictEqual(facets.services, [{ value: "עיצוב פנים", provenance: "website", sourceUrl: "https://example.co.il/" }]);
assert.strictEqual(facets.projectTypes[0].provenance, "website", "value on the page is website-verified");
assert.strictEqual(facets.projectTypes[0].sourceUrl, "https://example.co.il/", "verified page URL replaces the bogus claimed one");
assert.deepStrictEqual(
  facets.markets[0],
  { value: "Commercial", provenance: "ai_inference", sourceUrl: "https://example.co.il/" },
  "an interpretation not found verbatim stays ai_inference, keeping a valid claimed URL"
);
assert.strictEqual(facets.markets[1].provenance, "website", "'מגורים' is found inside 'למגורים' (prefix letter)");
assert.strictEqual(facets.markets[1].sourceUrl, "https://example.co.il/renovation");
assert.strictEqual(facets.positioning.length, 1, "duplicate values collapse");
assert.ok(!("madeUpDimension" in facets), "unknown dimensions are dropped");
console.log("PASS: facet provenance is verified against the scraped pages, not trusted from the AI");

const evidence = sanitizeAiEvidence(
  [
    { quote: "שיפוץ קומפלט למגורים", url: "https://example.co.il/" },
    { quote: "a quote that is nowhere on the site", url: "https://evil.example/" }
  ],
  corpus
);
assert.deepStrictEqual(evidence[0], { quote: "שיפוץ קומפלט למגורים", sourceUrl: "https://example.co.il/renovation", verified: true });
assert.deepStrictEqual(evidence[1], { quote: "a quote that is nowhere on the site", sourceUrl: null, verified: false });
console.log("PASS: evidence quotes keep a real source URL and are marked verified only when found");

// 5
const owner = ownerFacets("אדריכלות", ["קיסריה"]);
const merged = mergeFacets(owner, {
  services: [{ value: "אדריכלות", provenance: "ai_inference", sourceUrl: "https://example.co.il/" }],
  markets: [{ value: "מגורים", provenance: "ai_inference", sourceUrl: null }]
});
assert.strictEqual(merged.services.length, 1);
assert.strictEqual(merged.services[0].provenance, "owner", "owner value is never overwritten");
assert.strictEqual(merged.geographies[0].provenance, "owner");
assert.strictEqual(merged.markets[0].value, "מגורים", "new AI dimension is added alongside owner facets");

const upgraded = mergeFacets(merged, { markets: [{ value: "מגורים", provenance: "website", sourceUrl: "https://example.co.il/renovation" }] });
assert.strictEqual(upgraded.markets[0].provenance, "website", "ai_inference upgrades to website once verified");
console.log("PASS: merging keeps owner provenance and upgrades verified AI values");

console.log("\nAll service facet checks passed.");
