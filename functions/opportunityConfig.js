// GuyHadas Visibility OS - M5 Opportunity Engine configuration
// (docs/M5_OPPORTUNITY_ENGINE_DESIGN.md §9). Plain numbers, no logic.
//
// Weights are per factor; a business may override them through
// businesses.opportunityWeights (known keys only, numbers 0..5). Thresholds
// are this engine's own modelling choices and are labelled ASSUMPTION
// wherever they influence an opportunity.
//
// Bump CONFIG_VERSION whenever a value here changes: it is part of the
// analysis cache identity and is stored on every opportunity (for M9
// calibration).

const ENGINE_VERSION = 1;
const CONFIG_VERSION = 1;

const DEFAULT_WEIGHTS = Object.freeze({
  businessRelevance: 3,
  commercialValue: 2,
  demand: 2,
  upside: 3,
  effortInverse: 1
});

const THRESHOLDS = Object.freeze({
  // ranking_upside: impression-weighted position band considered improvable
  // (historical SEO convention -> ASSUMPTION, not a Google rule).
  upsidePositionMin: 4,
  upsidePositionMax: 20,
  upsideStrongMax: 10,
  // ctr_upside: only among results already on page 1, and only when the
  // topic CTR is below this share of the site's own observed CTR.
  ctrPositionMax: 10,
  ctrShareOfSite: 0.5,
  // Minimum impressions for visibility-based rules: the higher of this
  // absolute floor and the business's own lower-tercile of topic impressions.
  minImpressionsAbsolute: 20,
  // Priority bands on the 0..100 normalized score.
  highBand: 65,
  mediumBand: 40
});

// Effort per type (ASSUMPTION): 3 = small change, 1 = large.
const EFFORT_BY_TYPE = Object.freeze({
  technical_blocker: 3,
  ctr_upside: 3,
  internal_linking: 3,
  ranking_upside: 2,
  page_not_visible: 2,
  entity_clarity: 2,
  coverage_gap: 1,
  page_overlap_observed: 1
});

const CANDIDATE_ACTIONS = Object.freeze({
  technical_blocker: ["IMPROVE_PAGE", "DEINDEX_NOINDEX_REVIEW"],
  ranking_upside: ["IMPROVE_PAGE", "UPDATE_CONTENT", "ADD_INTERNAL_LINKS"],
  ctr_upside: ["IMPROVE_PAGE"],
  coverage_gap: ["CREATE_PAGE", "IMPROVE_PAGE"],
  page_not_visible: ["IMPROVE_PAGE", "REWORK_INTENT", "WAIT_FOR_DATA"],
  internal_linking: ["ADD_INTERNAL_LINKS"],
  page_overlap_observed: ["MONITOR", "CONSOLIDATE_PAGES"],
  entity_clarity: ["ADD_ENTITY_COVERAGE", "ADD_STRUCTURED_DATA"]
});

// GEO readiness signals that become entity_clarity opportunities when
// missing/partial. structured_data_coverage alone is housekeeping (Google:
// no special markup needed for AI features), audience_positioning is too
// soft to act on without M6 entity work.
const ENTITY_SIGNALS = Object.freeze(["business_identity", "services_explicit", "locations_explicit", "contact_details", "fact_consistency"]);

function resolveWeights(override) {
  const w = { ...DEFAULT_WEIGHTS };
  const applied = {};
  if (override && typeof override === "object") {
    for (const [k, v] of Object.entries(override)) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_WEIGHTS, k) && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 5) {
        w[k] = v;
        applied[k] = v;
      }
    }
  }
  return { weights: w, applied };
}

module.exports = { ENGINE_VERSION, CONFIG_VERSION, DEFAULT_WEIGHTS, THRESHOLDS, EFFORT_BY_TYPE, CANDIDATE_ACTIONS, ENTITY_SIGNALS, resolveWeights };
