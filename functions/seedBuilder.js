// GuyHadas Visibility OS - M3.2 Search Seed Builder (docs/MASTER.md §9,
// docs/M3.2_IMPLEMENTATION_BRIEF.md §3).
//
//   CONFIRMED SERVICE / OFFER MAP (+ business context, owner rules)
//        -> deterministic SEED OBJECTS -> market discovery (Semrush)
//
// Pure and deterministic: no Firestore, no network, no LLM. Same input ->
// same seeds, in the same order. Every seed carries its lineage (which
// confirmed service, which facet values, their provenance and the pages
// they came from) so a discovered query can be traced back to the business
// truth that produced it.
//
// Rules (owner truth first):
//   - Only ownerStatus == "confirmed" items seed. needs_review never does;
//     rejected items (name + aliases) are a NEGATIVE signal: no seed may
//     equal them.
//   - Geography: owner-declared service areas win - the business profile's
//     geographicMarkets and owner-provenance facet values. A website / AI
//     geography is only a target when it appears on at least
//     `minPagesForServiceArea` distinct crawled pages; otherwise it is most
//     likely a single portfolio/project location (Hagar: געתון, כפר ביאליק)
//     and is reported as a skipped "project_location_signal", never seeded.
//   - A geography written in a different script from the service name is
//     not combined with it ("עיצוב פנים Caesarea" is not a real search) -
//     reported as "script_mismatch" so the owner can add the local-language
//     name to the profile.
//   - Modifiers (project type / audience / need) only from owner or
//     website-verified values, never from unverified AI interpretation.
//   - Caps: per service and global, filled round-robin by service priority
//     so every confirmed service gets its base seed before any service gets
//     a second one. Nothing combinatorial.
//   - Owner exclusion rules apply to seeds as well as to discovered queries.

const crypto = require("crypto");

const DEFAULT_SEED_CONFIG = Object.freeze({
  maxSeeds: 15,
  maxSeedsPerService: 4,
  maxGeosPerService: 2,
  maxTermsPerService: 1,
  maxModifiersPerService: 1,
  minPagesForServiceArea: 3,
  modifierDimensions: ["projectTypes", "audiences", "needs"]
});

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const KIND_ORDER = { service: 0, service_geo: 1, service_term: 2, service_modifier: 3 };

function normalizePhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?"'()[\]{}:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seedKeyFor(phrase) {
  return crypto.createHash("sha256").update(normalizePhrase(phrase)).digest("hex").slice(0, 16);
}

function scriptOf(text) {
  const hasHebrew = /[֐-׿]/.test(text);
  const hasLatin = /[a-z]/i.test(text);
  if (hasHebrew && !hasLatin) return "hebrew";
  if (hasLatin && !hasHebrew) return "latin";
  if (hasHebrew && hasLatin) return "mixed";
  return "other";
}

function sameScript(a, b) {
  const sa = scriptOf(a);
  const sb = scriptOf(b);
  if (sa === "other" || sb === "other" || sa === "mixed" || sb === "mixed") return true;
  return sa === sb;
}

function tokensOf(text) {
  return normalizePhrase(text).split(" ").filter(Boolean);
}

// true when every token of `value` already appears in `phrase`
function isRedundant(phrase, value) {
  const have = new Set(tokensOf(phrase));
  const want = tokensOf(value);
  return want.length > 0 && want.every((t) => have.has(t));
}

function pagesFor(fv) {
  const pages = new Set([...(fv.foundOn || []), ...(fv.sourceUrl ? [fv.sourceUrl] : [])]);
  return pages.size;
}

function matchesExclusion(phrase, exclusionRules) {
  const lower = normalizePhrase(phrase);
  return exclusionRules.find((rule) => rule && lower.includes(normalizePhrase(rule))) || null;
}

function buildRejectedTerms(rejectedServices) {
  const terms = new Set();
  for (const s of rejectedServices) {
    for (const n of [s.name, ...(s.aliases || [])]) {
      const norm = normalizePhrase(n);
      if (norm) terms.add(norm);
    }
  }
  return terms;
}

// Geography candidates for one service: owner first, then website/AI values
// that appear on enough pages to look like a real service area.
function geographiesFor(service, business, config, skip) {
  const out = [];
  const seen = new Set();
  const add = (value, component) => {
    const norm = normalizePhrase(value);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push({ ...component, value: String(value).trim() });
  };

  for (const g of business.geographicMarkets || []) {
    add(g, { dimension: "geographies", provenance: "owner", origin: "business_profile", sourceUrl: null, pageCount: null });
  }
  const facetGeos = (service.facets && service.facets.geographies) || [];
  for (const fv of facetGeos.filter((v) => v.provenance === "owner")) {
    add(fv.value, { dimension: "geographies", provenance: "owner", origin: "service_facet", sourceUrl: fv.sourceUrl || null, pageCount: null });
  }
  const promoted = facetGeos
    .filter((v) => v.provenance !== "owner" && !seen.has(normalizePhrase(v.value)))
    .map((v) => ({ fv: v, pages: pagesFor(v) }))
    .sort((a, b) => b.pages - a.pages || a.fv.value.localeCompare(b.fv.value));
  for (const { fv, pages } of promoted) {
    if (seen.has(normalizePhrase(fv.value))) continue;
    if (pages >= config.minPagesForServiceArea) {
      add(fv.value, { dimension: "geographies", provenance: fv.provenance, origin: "website_multi_page", sourceUrl: fv.sourceUrl || null, pageCount: pages });
    } else {
      seen.add(normalizePhrase(fv.value));
      skip({ dimension: "geographies", value: fv.value, provenance: fv.provenance, sourceUrl: fv.sourceUrl || null, pageCount: pages, reason: "project_location_signal" });
    }
  }
  return out;
}

// buildSeeds({ business, services, exclusionRules, config })
//   business: { id, name, geographicMarkets[] }
//   services: all businessServices rows for the business (any status)
//   exclusionRules: owner exclusion rule strings (businessKnowledge)
// returns { seeds, skipped, droppedByCap, config, inputs }
function buildSeeds({ business, services, exclusionRules = [], config = {} }) {
  const cfg = { ...DEFAULT_SEED_CONFIG, ...config };
  const all = services || [];
  const confirmed = all
    .filter((s) => s.ownerStatus === "confirmed" && normalizePhrase(s.name))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) ||
        normalizePhrase(a.name).localeCompare(normalizePhrase(b.name)) ||
        String(a.id).localeCompare(String(b.id))
    );
  const rejectedTerms = buildRejectedTerms(all.filter((s) => s.ownerStatus === "rejected"));
  const skipped = [];

  const perService = confirmed.map((service) => {
    const ctx = { serviceId: service.id, serviceName: service.name };
    const skip = (entry) => skipped.push({ ...ctx, ...entry });
    const nameComponent = {
      dimension: "services",
      value: service.name,
      provenance: "owner",
      origin: "confirmed_service_name",
      sourceUrl: null,
      pageCount: null
    };
    const candidates = [];
    const push = (kind, phrase, components, explanation) => {
      const rule = matchesExclusion(phrase, exclusionRules);
      if (rule) return skip({ dimension: components[components.length - 1].dimension, value: phrase, provenance: null, reason: "owner_exclusion_rule", rule });
      if (rejectedTerms.has(normalizePhrase(phrase))) return skip({ dimension: components[components.length - 1].dimension, value: phrase, provenance: null, reason: "matches_rejected_service" });
      candidates.push({ kind, phrase: phrase.replace(/\s+/g, " ").trim(), components, explanation });
    };

    push("service", service.name, [nameComponent], `Confirmed service "${service.name}"`);

    const geos = geographiesFor(service, business, cfg, skip);
    let geoCount = 0;
    for (const geo of geos) {
      if (geoCount >= cfg.maxGeosPerService) {
        skip({ dimension: "geographies", value: geo.value, provenance: geo.provenance, reason: "geo_cap" });
        continue;
      }
      if (!sameScript(service.name, geo.value)) {
        skip({ dimension: "geographies", value: geo.value, provenance: geo.provenance, reason: "script_mismatch" });
        continue;
      }
      if (isRedundant(service.name, geo.value)) continue;
      push("service_geo", `${service.name} ${geo.value}`, [nameComponent, geo], `Confirmed service × ${geo.provenance === "owner" ? "owner service area" : "area found on " + geo.pageCount + " pages"} "${geo.value}"`);
      geoCount++;
    }

    const facets = service.facets || {};
    const terms = (facets.services || [])
      .filter((v) => v.provenance === "owner" || v.provenance === "website")
      .filter((v) => normalizePhrase(v.value) !== normalizePhrase(service.name))
      .sort((a, b) => (a.provenance === "owner" ? 0 : 1) - (b.provenance === "owner" ? 0 : 1) || a.value.localeCompare(b.value));
    let termCount = 0;
    for (const t of terms) {
      if (termCount >= cfg.maxTermsPerService) break;
      push("service_term", t.value, [{ dimension: "services", value: t.value, provenance: t.provenance, origin: "service_facet", sourceUrl: t.sourceUrl || null, pageCount: pagesFor(t) }], `Service term "${t.value}" (${t.provenance}) of "${service.name}"`);
      termCount++;
    }

    let modCount = 0;
    for (const dim of cfg.modifierDimensions) {
      const values = (facets[dim] || []).slice().sort((a, b) => (a.provenance === "owner" ? 0 : 1) - (b.provenance === "owner" ? 0 : 1) || a.value.localeCompare(b.value));
      for (const v of values) {
        if (v.provenance === "ai_inference") {
          skip({ dimension: dim, value: v.value, provenance: v.provenance, reason: "unverified_ai_inference" });
          continue;
        }
        if (modCount >= cfg.maxModifiersPerService) continue;
        if (isRedundant(service.name, v.value) || !sameScript(service.name, v.value)) continue;
        push("service_modifier", `${service.name} ${v.value}`, [nameComponent, { dimension: dim, value: v.value, provenance: v.provenance, origin: "service_facet", sourceUrl: v.sourceUrl || null, pageCount: pagesFor(v) }], `Confirmed service × ${dim} "${v.value}" (${v.provenance})`);
        modCount++;
      }
    }

    candidates.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    return { service, candidates: candidates.slice(0, cfg.maxSeedsPerService), overflow: candidates.slice(cfg.maxSeedsPerService) };
  });

  // Round-robin across services (priority order), deduped by phrase.
  const seeds = [];
  const byKey = new Map();
  let droppedByCap = perService.reduce((n, p) => n + p.overflow.length, 0);
  const rounds = Math.max(0, ...perService.map((p) => p.candidates.length));
  for (let r = 0; r < rounds; r++) {
    for (const { service, candidates } of perService) {
      const c = candidates[r];
      if (!c) continue;
      const seedKey = seedKeyFor(c.phrase);
      if (byKey.has(seedKey)) {
        const existing = byKey.get(seedKey);
        if (!existing.serviceIds.includes(service.id)) existing.serviceIds.push(service.id);
        continue;
      }
      if (seeds.length >= cfg.maxSeeds) {
        droppedByCap++;
        continue;
      }
      const seed = {
        seedKey,
        phrase: c.phrase,
        kind: c.kind,
        serviceId: service.id,
        serviceIds: [service.id],
        serviceName: service.name,
        servicePriority: service.priority || "medium",
        components: c.components,
        explanation: c.explanation
      };
      byKey.set(seedKey, seed);
      seeds.push(seed);
    }
  }

  return {
    seeds,
    skipped,
    droppedByCap,
    config: cfg,
    inputs: {
      confirmedServiceCount: confirmed.length,
      rejectedServiceCount: all.filter((s) => s.ownerStatus === "rejected").length,
      ownerGeographies: (business.geographicMarkets || []).slice()
    }
  };
}

// Compact lineage stored on keywords/topics (seedRefs).
function seedRef(seed) {
  return {
    seedKey: seed.seedKey,
    phrase: seed.phrase,
    kind: seed.kind,
    serviceId: seed.serviceId,
    serviceName: seed.serviceName,
    components: seed.components.map((c) => ({ dimension: c.dimension, value: c.value, provenance: c.provenance }))
  };
}

module.exports = { buildSeeds, seedRef, seedKeyFor, normalizePhrase, scriptOf, DEFAULT_SEED_CONFIG };
