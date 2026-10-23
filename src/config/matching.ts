/** All matching weights and limits live here so they can be tuned without touching logic. */
export const MATCHING = {
  /** Structured score components. They are re-normalised, so only their ratios matter. */
  structured: {
    /** Share of the Seeker's languages the Guide speaks. */
    language: 0.35,
    /** Years of experience, saturating at `experienceFullYears`. */
    experience: 0.4,
    /** A Guide who covers fewer categories counts as more focused. */
    focus: 0.25,
  },
  experienceFullYears: 15,

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
