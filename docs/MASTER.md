# SEO ENGINE — MASTER ARCHITECTURE & PRODUCT SPECIFICATION
## vNext Final — Business Understanding, Entity, Intent, Decision, Measurement & Learning

**Status:** CANONICAL — product, architecture, implementation roadmap and acceptance specification  
**Date:** 2026-10-08  
**Purpose:** This is the single Source of Truth shared by Guy, ChatGPT and Claude for the GuyHadas Visibility OS. It consolidates the SEO/GEO architecture, the NAZA-derived improvements already incorporated into vNext, M3.1 implementation decisions and acceptance results, Search Universe, Time-to-Impact / Outcome Learning, API governance, LLM website understanding, implementation boundaries, milestones and production-readiness criteria.

---

# 1. Executive Definition

The SEO Engine is not a keyword-to-content generator.

It is an **evidence-driven SEO + GEO Decision Engine**.

Its purpose is to:

> Understand the business → discover search demand → qualify and model it → understand entities and intent → establish ownership → identify opportunities → decide what should change → predict expected impact → execute → measure → compare prediction with reality → learn.

The system must ultimately answer:

1. What does this business actually offer?
2. What does the market search for?
3. What entities, topics and intents are involved?
4. Which page currently owns an intent?
5. Should an existing page be improved or should a new page exist?
6. What evidence supports the decision?
7. What is the expected business/SEO/GEO value?
8. What should be done?
9. When should we reasonably expect evidence of impact?
10. Did the outcome match the prediction?
11. What should the system learn?
12. What should it do next?

The system is a closed-loop operating system, not a one-time research tool.

---

# 2. Canonical Product Principle

The fundamental intelligence chain is:

```text
Business
  ↓
Business Knowledge
  ↓
Business Understanding
  ↓
Service / Offer Map
  ↓
Search Discovery
  ↓
Search Universe
  ↓
Search Topic
  ↓
Query / Query Family
  ↓
Entity
  ↓
Intent
  ↓
User Task
  ↓
Canonical Page Ownership
  ↓
Opportunity
  ↓
Decision
  ↓
Impact Prediction
  ↓
Implementation
  ↓
Measurement
  ↓
Outcome
  ↓
Learning
  ↺
```

The system's unit of intelligence is therefore **not the keyword**.

A keyword/query is an observation.

The system reasons about:

> **Query → Intent → Entity → Topic → User Task → Page → Outcome**

Therefore:

> Search demand is not page demand.

And:

> A new query does not automatically justify a new URL.

---

# 3. Canonical Architecture Loop

The complete architecture is:

```text
BUSINESS KNOWLEDGE
        ↓
BUSINESS UNDERSTANDING
        ↓
SERVICE / OFFER MAP
        ↓
SEARCH DISCOVERY
        ↓
SEARCH UNIVERSE
        ↓
SEARCH TOPIC QUALIFICATION
        ↓
ENTITY RESOLUTION / ENTITY GRAPH
        ↓
SEARCH INTENT CLASSIFICATION
        ↓
INTENT OWNERSHIP / CANNIBALIZATION
        ↓
SEO + GEO INTELLIGENCE
        ↓
BASELINE
        ↓
OPPORTUNITY ENGINE
        ↓
DECISION ENGINE
        ↓
IMPACT PREDICTION
   ┌────┼───────────────┐
   ↓    ↓               ↓
CREATE IMPROVE        WAIT /
PAGE   PAGE            MONITOR
   └────┬───────────────┘
        ↓
PAGE / CONTENT STRATEGY
        ↓
IMPLEMENTATION
        ↓
PUBLISH / UPDATE
        ↓
OBSERVATION WINDOW
        ↓
SEARCH CONSOLE + ANALYTICS + SERP + GEO OBSERVATIONS
        ↓
OUTCOME MEASUREMENT
        ↓
PREDICTION VS ACTUAL
        ↓
LEARNING ENGINE
        ↺
```

The system must be capable of returning:

- CREATE
- IMPROVE
- CONSOLIDATE
- WAIT
- MONITOR
- REJECT
- NO ACTION

**NO ACTION is a valid and valuable decision.**

---

# 4. Business Knowledge

`Business Knowledge` represents what the owner/business explicitly tells the system.

Examples:

- business description
- services
- products
- audiences
- markets
- geographies
- positioning
- business priorities
- strategic terms
- commercial priorities

Owner-provided information is strategic truth unless explicitly changed by the owner.

AI must not overwrite owner truth.

---

# 5. Business Understanding

Business Understanding is a distinct intelligence layer between Business Knowledge and Search Discovery.

It represents what the system understands about what the business actually does.

This layer may combine:

- owner-provided information
- website evidence
- structured data
- future external business sources
- AI interpretation/inference

Business Understanding is **not** the Search Universe.

It is the system's structured understanding of the business.

---

# 6. Service / Offer Map

The Service / Offer Map is the first structured, owner-reviewable representation of Business Understanding.

It is a first-class M3.1 object.

It may contain:

- Service
- Project Type
- Audience
- Market
- Offering
- Geography
- Positioning
- Need

Not every candidate requires every facet.

The system must preserve the semantic distinction between these dimensions.

A service can therefore be represented as:

```text
Service
+
Project Type
+
Audience
+
Geography
+
Need
+
Positioning
```

These structured dimensions later become inputs to Search Discovery.

The Service Map is not a keyword list.

It is not disposable.

It is the bridge between understanding the business and discovering market search demand.

---

# 7. Website = Evidence, Not Search Universe

This is a permanent architecture rule.

Correct:

```text
WEBSITE
  ↓
CRAWL
  ↓
PAGE-LEVEL EVIDENCE
  ↓
BUSINESS UNDERSTANDING
  ↓
SERVICE / OFFER CANDIDATES
  ↓
OWNER VALIDATION
  ↓
CONFIRMED SERVICE MAP
  ↓
SEARCH DISCOVERY
```

Incorrect:

```text
WEBSITE WORDS
  ↓
KEYWORDS
  ↓
SEARCH TOPICS
```

The website may be marketing-oriented rather than SEO-oriented.

Therefore:

- website terminology is evidence
- website pages are evidence sources
- website concepts can produce candidate services
- website concepts must not automatically become approved Search Topics

The retired `visibilityDiscoverFromWebsite` direct-topic-scanner behavior must not return.

---

# 8. M3.1 Business & Service Discovery

M3.1 owns:

```text
Business Knowledge
        ↓
Business Understanding
        ↓
Service / Offer Map
```

M3.1 must:

1. ingest onboarding information
2. crawl the website beyond the homepage
3. extract page-level evidence
4. understand what the business offers
5. discover candidate services/offers/facets
6. preserve provenance
7. allow owner validation
8. persist the validated Service Map
9. prevent rejected items from silently returning
10. expose confirmed Service Map as the input contract for M3.2

M3.1 must NOT implement the full Search Universe.

---

# 9. M3.1 → M3.2 Contract

M3.2 begins with:

```text
CONFIRMED SERVICE / OFFER MAP
+
BUSINESS CONTEXT
+
OWNER PRIORITIES
+
EVIDENCE / PROVENANCE
```

and produces:

```text
SEARCH SEEDS
↓
MARKET DISCOVERY
↓
RAW QUERIES
↓
NORMALIZATION / DEDUPLICATION
↓
QUERY FAMILIES
↓
SEARCH TOPICS
↓
PRELIMINARY INTENT
↓
QUALIFICATION
↓
OWNER REVIEW
↓
APPROVED SEARCH UNIVERSE
```

Sources may include:

- Semrush
- Google Search Console
- SERP data
- competitor research
- AI research
- other replaceable providers

Search volume is evidence, not strategy.

GSC represents actual current visibility, not the complete market universe.

---

# 10. M3.1 Website Crawling

The crawler must:

- follow redirects
- handle sitemap indexes
- tolerate www/non-www differences when appropriate
- use internal links for prioritization
- fetch a bounded number of relevant pages
- skip utility pages where appropriate
- record crawl results
- preserve page URLs
- record failure/skipping reasons

A crawl report should retain:

- pages discovered
- pages fetched
- pages parsed
- pages failed
- pages skipped
- reasons
- URLs analyzed

The system must never claim that a page was analyzed if it was not actually fetched and parsed.

Current implementation has successfully demonstrated multi-page crawling on the Hagar Lushi site.

---

# 11. Page-Level Provenance

Every website-derived observation must retain the actual originating page.

Example:

```text
Service:
Residential Architecture

Evidence:
- quote A → /architecture
- quote B → /projects/project-x
- quote C → /about
```

Do not automatically credit evidence to the homepage.

If AI claims that a concept is present on a specific page:

1. verify that the evidence exists there
2. retain that page as the source
3. if it does not exist there, use the actual source page
4. preserve multiple supporting pages where appropriate

Evidence should include:

- observation/quote
- source URL
- originating page
- provenance
- related service/facet
- timestamp where appropriate

---

# 12. Provenance Model

The system must distinguish:

### OWNER

Explicitly provided by the business owner.

### WEBSITE

Actually found in website evidence.

### AI_INFERENCE

Interpreted/inferred by AI from available evidence.

These are materially different.

Owner-provided values must never be silently overwritten by AI.

Website provenance must only be assigned when the value is actually supported by website evidence.

AI inference must not be presented as direct website fact.

---

# 13. Owner Validation

The owner must be able to:

- Confirm
- Reject
- Edit
- Add
- Prioritize

The UI should remain simple.

The owner should validate business truth rather than manually classify thousands of attributes.

States include:

```text
NEEDS_REVIEW
CONFIRMED
REJECTED
```

Rejected items must not silently reappear in future analysis.

---

# 14. Service Map Data Model

Conceptually:

```text
businessServices
{
  businessId
  name
  description

  source
  confidence
  ownerStatus
  priority

  facets:
    service
    projectType
    audience
    market
    offering
    geography
    positioning
    need

  provenance per facet

  evidenceSources[]
  sourceUrls[]

  createdAt
  updatedAt
}
```

The exact schema may evolve.

The semantic distinction between the facets must remain.

---

# 15. Entity Graph

The system should maintain an Entity Graph alongside Search Topics.

Initial entity types:

- Organization
- Brand
- Product
- Service
- Person
- Place
- Problem
- Solution
- Topic
- Concept
- Event
- Claim
- Source
- Evidence
- Content Asset
- Page
- Video
- Dataset
- Competitor
- Market
- Language / Locale

The schema must allow additional entity types without redesign.

Example relationships:

```text
Brand
 ├── offers → Product
 ├── operates_in → Market
 ├── competes_with → Competitor
 └── owns → Content

Problem
 ├── searched_by → Query
 ├── solved_by → Solution
 ├── relevant_to → Audience
 └── represented_by → Search Topic

Search Topic
 ├── contains → Query
 ├── targets → Intent
 ├── concerns → Entity
 ├── maps_to → Page
 └── generates → Opportunity

Page
 ├── owns → Search Intent
 ├── targets → Entity
 ├── covers → Search Topics
 ├── links_to → Page
 └── produces → Search Outcome
```

Do not implement the entire Entity Graph prematurely in M3.1.

M3.1 must remain compatible with it.

---

# 16. Search Topic

A Search Topic is not a keyword row.

A query is an observation.

A Search Topic is a normalized strategic concept that may contain many related queries.

Future Search Topic relationships should support:

- query/query family
- entity
- intent
- user task
- audience
- geography
- business relevance
- commercial value
- owner priority
- SEO signals
- GEO signals
- current visibility
- competitors
- evidence
- opportunities
- page ownership
- cannibalization

Do not implement the full Search Topic intelligence layer in M3.1.

Do not create a schema that prevents it.

---

# 17. Search Intent

Create/maintain a persistent `SearchIntent` concept.

Minimum conceptual fields:

```text
intent_id
intent_type
user_task
entity_ids[]
topic_ids[]
query_ids[]
primary_owner_page_id
candidate_owner_page_ids[]
ownership_confidence
cannibalization_risk
business_value
status
last_evaluated_at
```

Initial intent taxonomy should remain extensible and support:

- informational
- commercial investigation
- transactional
- navigational
- local
- comparison
- problem discovery
- solution discovery
- definition / meaning
- how-to
- review
- pricing
- availability
- location
- entity-specific
- media/video
- research/evidence

---

# 18. Intent Ownership

For each meaningful intent:

> Identify the canonical page that should own the intent.

If an existing page already owns the intent:

> Default action = IMPROVE.

A second page is justified only when:

- entity is materially different
- user task is materially different
- information required is materially different

This rule prevents keyword-driven page proliferation.

---

# 19. Cannibalization

Cannibalization is a system-level concept.

For candidate pages evaluate:

- target queries
- intent
- entity
- user task
- SERP overlap
- existing coverage
- semantic similarity
- expected canonical ownership

States:

```text
NO_COLLISION
RELATED_BUT_DISTINCT
POTENTIAL_COLLISION
HIGH_COLLISION
DUPLICATE
```

Every new-page recommendation must eventually explain:

```text
existing_owner_page
collision_status
collision_reason
why_new_page_is_or_is_not_justified
```

---

# 20. Opportunity Engine

An Opportunity is not simply a high-volume keyword.

It is a potential business/SEO action supported by evidence.

Types include:

- CREATE_PAGE
- IMPROVE_PAGE
- CONSOLIDATE_PAGES
- REDIRECT
- UPDATE_CONTENT
- ADD_INTERNAL_LINKS
- REWORK_INTENT
- ADD_ENTITY_COVERAGE
- ADD_STRUCTURED_DATA
- ADD_SOURCE / EVIDENCE
- LOCALIZE
- DEINDEX / NOINDEX
- WAIT_FOR_DATA
- MONITOR

Opportunity scoring may consider:

- search demand
- demand trend
- intent clarity
- business relevance
- commercial value
- audience relevance
- SERP opportunity
- competition
- existing visibility
- current position
- CTR gap
- content gap
- entity coverage gap
- evidence availability
- content uniqueness potential
- internal-link potential
- GEO relevance
- freshness
- cannibalization risk
- implementation cost
- expected value
- confidence

Weights must be configurable by project.

---

# 21. Decision Engine

Every Opportunity eventually passes through a Decision Engine.

Outputs:

```text
CREATE
IMPROVE
CONSOLIDATE
WAIT
MONITOR
REJECT
```

Decision concept:

```text
decision_id
opportunity_id
decision
confidence
evidence_ids[]
existing_page_id
recommended_page_id
reason_codes[]
blocking_conditions[]
estimated_effort
estimated_value
created_at
model_version
```

Recommendations must be explainable through structured evidence.

---

# 22. Evidence & Confidence

Every important recommendation must separate:

### OBSERVED
Directly measured or retrieved.

### INFERENCE
System interpretation.

### ASSUMPTION
Modeling choice.

### HYPOTHESIS
Something to test.

### RECOMMENDATION
Proposed action.

Evidence concept:

```text
evidence_id
source_id
observation
evidence_type
source_quality
captured_at
related_entity_ids[]
related_topic_ids[]
confidence
```

Recommendation trace:

```text
Recommendation
 → Opportunity
   → Signals
     → Sources
       → Raw observations
```

---

# 23. Internal Linking Intelligence

Internal links are part of the SEO graph.

Evaluate:

- source page
- target page
- target entity
- target intent
- relationship type
- anchor recommendation
- contextual placement
- expected value
- existing link

The system should identify:

- orphan pages
- underlinked pages
- overlinked pages
- cluster connectivity
- authority distribution
- missing contextual relationships

---

# 24. Content Family Boundaries

Each content family should eventually define:

```text
Purpose
Primary intents
Entities owned
Allowed content
Adjacent content
Forbidden content
Canonical owners
```

This prevents content sprawl and overlapping page purposes.

---

# 25. Entity Consistency

Maintain canonical entity facts where appropriate:

- name
- alternate names
- category
- attributes
- official URLs
- relationships
- identifiers
- schema IDs
- last reviewed

Detect conflicting values across pages.

---

# 26. Localization

Localization is demand-led.

Do not translate everything automatically.

Evidence may include:

- local search demand
- impressions
- traffic
- market distribution
- commercial opportunity
- audience need
- press/distribution activity

Possible decisions:

```text
DISPLAY_TRANSLATION
INDEX_LOCALIZED_PAGE
DO_NOT_LOCALIZE
WAIT
```

Default principle:

> Translate winners, not the entire inventory.

---

# 27. Scale Gates

The system must not equate more pages with more SEO.

Stages:

```text
Stage 0 — Research
Stage 1 — Core pages
Stage 2 — Proven expansion
Stage 3 — Programmatic expansion
Stage 4 — Large-scale ecosystem
```

Progression should depend on evidence such as:

- indexed core pages
- proven query demand
- stable publishing
- low duplication
- reliable data
- Search Console feedback