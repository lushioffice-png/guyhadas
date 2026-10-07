// GuyHadas Visibility OS - per-provider/operation cost & quota limits
// (Universal External API Cost-Control Rule - see the permanent rule in
// the project docs: claude/visibility-os-api-cost-control-rule.md).
//
// Plain, easily-tunable numbers - no logic lives here. functions/apiUsage.js
// reads this config to decide blocked_by_budget / blocked_by_quota /
// cache-validity before any provider is actually called. Raise these
// numbers as real usage proves they're safe to raise, not before - they
// are deliberately conservative starting points for a system with a
// handful of real businesses on it today, not a load-tested ceiling.

module.exports = {
  anthropic: {
    analyzeBusinessServices: {
      // claude-sonnet-5-5, verified against
      // platform.claude.com/docs/en/about-claude/pricing at implementation
      // time (see the cost-control rule doc for the citation) - not
      // guessed. Used both for the pre-call estimate (from a chars/4
      // heuristic on the prompt) and, more importantly, for the real
      // post-call cost computed from Anthropic's own reported
      // input_tokens/output_tokens - that second number is what actually
      // gets recorded and budget-checked against.
      inputPricePerMTokUsd: 2,
      outputPricePerMTokUsd: 10,
      maxEstimatedCostPerCallUsd: 0.5,
      maxRequestsPerBusinessPerDay: 5,
      maxRequestsPerBusinessPerMonth: 30,
      maxRequestsGlobalPerDay: 50,
      maxRequestsGlobalPerMonth: 500,
      // null = the cached result stays valid until the input hash itself
      // changes (the website evidence or confirmed-service list changed),
      // not on a timer - there's no reason to re-ask Claude about an
      // unchanged website just because a day passed.
      cacheTtlMs: null,
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 15 * 60 * 1000
    }
  },
  semrush: {
    discoverFromSemrush: {
      // Semrush's API doesn't expose a $/unit price (it depends on the
      // account's subscription tier, which this code has no way to read) -
      // cost is tracked in API units instead, a real and deterministic
      // quantity, per the cost-control rule's "best available unit/quota
      // estimate" fallback for providers without predictable $ pricing.
      // 30*40 (phrase_related) + 50*10 (domain_organic) + 10*40
      // (domain_organic_organic) - see functions/semrush.js for the
      // per-report unit costs and limits this must stay in sync with.
      unitsPerCall: 30 * 40 + 50 * 10 + 10 * 40,
      maxRequestsPerBusinessPerDay: 10,
      maxRequestsPerBusinessPerMonth: 60,
      maxRequestsGlobalPerDay: 100,
      maxRequestsGlobalPerMonth: 1000,
      // Unlike the Anthropic cache above, this one DOES expire on a timer
      // even with an unchanged seed/domain - real-world search demand
      // genuinely drifts day to day, so a week-old Semrush pull going
      // stale isn't the same situation as a website's own text being
      // unchanged.
      cacheTtlMs: 24 * 60 * 60 * 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 15 * 60 * 1000
    }
  }
};
