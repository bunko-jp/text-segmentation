/**
 * @file Bayesian n-gram divergence calculation.
 *
 * Computes Jensen-Shannon divergence between adjacent text windows
 * using n-gram multinomial distributions with optional prior weighting.
 *
 * When a prior is provided, n-gram log-probabilities are shifted by the
 * prior weights, amplifying divergence at domain-specific vocabulary boundaries
 * (e.g., legal boilerplate vs. narrative text).
 *
 * Without a prior, this reduces to a pure n-gram JSD — a general-purpose
 * measure of distributional change between adjacent text segments.
 */

import { tokenizeText } from "./tokenizer";

// ============================================================
// Types
// ============================================================

/** Per-ngram prior weight. Positive values amplify that ngram's contribution to divergence. */
export type NgramPrior = ReadonlyMap<string, number>;

export type BayesDivergenceConfig = {
  /** Optional prior distribution for domain-specific weighting. */
  readonly prior?: NgramPrior;
  /** Scaling factor for prior influence (default: 1.0). Set to 0 to disable. */
  readonly priorWeight?: number;
};

// ============================================================
// Constants
// ============================================================

const LAPLACE_ALPHA = 1;
const LOG2 = Math.log(2);
const DEFAULT_PRIOR_WEIGHT = 1.0;

// ============================================================
// N-gram distribution
// ============================================================

type NgramDistribution = {
  readonly counts: ReadonlyMap<string, number>;
  readonly total: number;
  readonly vocabulary: ReadonlySet<string>;
};

function buildNgramCounts(tokens: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function buildDistribution(tokens: readonly string[]): NgramDistribution {
  const counts = buildNgramCounts(tokens);
  return {
    counts,
    total: tokens.length,
    vocabulary: new Set(counts.keys()),
  };
}

/**
 * Computes smoothed log-probability of a token in a distribution.
 * Uses Laplace smoothing: P(t) = (count(t) + α) / (total + α * |V|)
 */
function smoothedLogProb(
  token: string,
  dist: NgramDistribution,
  vocabularySize: number,
): number {
  const count = dist.counts.get(token) ?? 0;
  const prob = (count + LAPLACE_ALPHA) / (dist.total + LAPLACE_ALPHA * vocabularySize);
  return Math.log(prob);
}

// ============================================================
// Prior-weighted probability
// ============================================================

function applyPrior(
  logProb: number,
  token: string,
  prior: NgramPrior | undefined,
  priorWeight: number,
): number {
  if (!prior || priorWeight === 0) {
    return logProb;
  }

  const weight = prior.get(token);
  if (weight === undefined) {
    return logProb;
  }

  return logProb + weight * priorWeight;
}

// ============================================================
// Jensen-Shannon Divergence
// ============================================================

/**
 * Computes the KL divergence D_KL(P || Q) over a shared vocabulary.
 * Both P and Q use Laplace smoothing to avoid zero probabilities.
 */
function klDivergence(
  p: NgramDistribution,
  q: NgramDistribution,
  vocabulary: ReadonlySet<string>,
  vocabularySize: number,
  prior: NgramPrior | undefined,
  priorWeight: number,
): number {
  return Array.from(vocabulary).reduce((sum, token) => {
    const logP = applyPrior(smoothedLogProb(token, p, vocabularySize), token, prior, priorWeight);
    const logQ = applyPrior(smoothedLogProb(token, q, vocabularySize), token, prior, priorWeight);

    // P(token) in probability space (for weighting)
    const pProb = Math.exp(logP);

    // KL contribution: P(t) * log(P(t) / Q(t)) = P(t) * (logP - logQ)
    return sum + pProb * (logP - logQ);
  }, 0);
}

/**
 * Computes Jensen-Shannon divergence between two n-gram distributions.
 *
 * JSD(P, Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M)
 * where M = 0.5 * (P + Q)
 *
 * Returns a value in [0, 1] (normalized by log(2)).
 */
function jensenShannonDivergence(
  distA: NgramDistribution,
  distB: NgramDistribution,
  prior: NgramPrior | undefined,
  priorWeight: number,
): number {
  // Build the union vocabulary
  const vocabulary = new Set<string>();
  for (const token of distA.vocabulary) {
    vocabulary.add(token);
  }
  for (const token of distB.vocabulary) {
    vocabulary.add(token);
  }

  if (vocabulary.size === 0) {
    return 0;
  }

  // Build the mixture distribution M = 0.5 * (P + Q)
  const mixtureCounts = new Map<string, number>();
  for (const token of vocabulary) {
    const countA = distA.counts.get(token) ?? 0;
    const countB = distB.counts.get(token) ?? 0;
    mixtureCounts.set(token, countA + countB);
  }

  const mixtureDist: NgramDistribution = {
    counts: mixtureCounts,
    total: distA.total + distB.total,
    vocabulary,
  };

  const vocabularySize = vocabulary.size;

  const klAM = klDivergence(distA, mixtureDist, vocabulary, vocabularySize, prior, priorWeight);
  const klBM = klDivergence(distB, mixtureDist, vocabulary, vocabularySize, prior, priorWeight);

  const jsd = 0.5 * klAM + 0.5 * klBM;

  // Normalize to [0, 1] by dividing by log(2)
  return Math.max(0, Math.min(1, jsd / LOG2));
}

// ============================================================
// Public API
// ============================================================

/**
 * Computes Bayesian n-gram divergence scores between adjacent texts.
 *
 * For texts [a, b, c, d], returns divergence scores:
 * [JSD(a, b), JSD(b, c), JSD(c, d)]
 *
 * Each score is in [0, 1]: 0 = identical distributions, 1 = maximally different.
 *
 * When a prior is provided, the divergence is amplified at ngrams with high
 * prior weights, making the score sensitive to domain-specific vocabulary shifts.
 */
export function calculateAdjacentBayesDivergence(
  texts: readonly string[],
  config?: BayesDivergenceConfig,
): number[] {
  if (texts.length < 2) {
    return [];
  }

  const prior = config?.prior;
  const priorWeight = config?.priorWeight ?? DEFAULT_PRIOR_WEIGHT;

  const distributions = texts.map((text) => {
    const tokens = tokenizeText(text);
    return buildDistribution(tokens);
  });

  return distributions
    .slice(0, -1)
    .map((current, i) => {
      const next = distributions[i + 1];
      if (!next) {
        return 0;
      }
      return jensenShannonDivergence(current, next, prior, priorWeight);
    });
}
