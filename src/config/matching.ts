/** All matching weights and limits live here so they can be tuned without touching logic. */
export const MATCHING = {
  /** Structured score components. They are re-normalised, so only their ratios matter. */
  structured: {
    helpOverlap: 0.3,
    functionIndustry: 0.2,
    availability: 0.15,
    seniority: 0.1,
    transition: 0.1,
    /** Used instead of `transition` when the Seeker asked for a similar transition. */
    transitionWhenRequested: 0.2,
    stageFit: 0.08,
    engagementMode: 0.07,
  },
  /** Weight of each Seeker help rank (position 1, 2, 3, then the rest). */
  helpRankWeights: [1, 0.7, 0.5, 0.3],
  helpLevelValue: { some: 0.5, solid: 0.8, expert: 1 },
  /** A Guide's own top-3 areas count a little more than their lower-ranked ones. */
  guideTopHelpBoost: 1,
  guideLowerHelpFactor: 0.85,
  /** Shared weekly hours (in UTC) at which availability overlap counts as full. */
  availabilityFullOverlapHours: 4,

  /** Preliminary and no-LLM ranking: blend of structured and vector similarity. */
  preliminary: { structured: 0.6, vector: 0.4 },
  /** Final ranking when the LLM reranked. Re-normalised. */
  finalWithLlm: { llm: 0.5, structured: 0.3, rating: 0.2 },
  /** Final ranking without the LLM. Re-normalised. */
  finalWithoutLlm: { structured: 0.5, vector: 0.3, rating: 0.2 },

  /** Bayesian average: new Guides start at the prior and move as ratings arrive. */
  rating: { priorMean: 3.5, priorWeight: 5, scale: 5, minCountToShow: 3 },

  pipeline: {
    /** Guides pulled from SQL by vector similarity before structured scoring. */
    retrievalLimit: 200,
    /** Candidates kept after blending (preliminary pool). */
    candidates: 30,
    /** Candidates sent to the LLM. */
    rerank: 15,
    /** Matches returned to the Seeker. */
    results: 5,
    /** Used when embeddings are disabled: top N by structured score. */
    noEmbeddingsPool: 20,
  },

  llm: { maxRetries: 3, timeoutMs: 45_000, maxOutputTokens: 1200 },
} as const;

export type HelpLevel = keyof typeof MATCHING.helpLevelValue;
