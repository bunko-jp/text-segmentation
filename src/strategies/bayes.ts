/**
 * @file Bayesian n-gram divergence segmentation strategy.
 *
 * Detects semantic boundaries by computing Jensen-Shannon divergence
 * between adjacent sentence windows using n-gram distributions with
 * optional Bayesian prior weighting.
 *
 * Without a prior, this is a general-purpose distributional change detector.
 * With a domain-specific prior (e.g., boilerplate vocabulary weights),
 * it amplifies divergence at prior-weighted vocabulary boundaries.
 */

import type {
  SegmentPoint,
  SegmentPointStreamEvent,
  WindowDivergenceResult,
  WindowSegmentationConfig,
} from "../utils/semantic-window-segmentation";
import { segmentByWindowDivergence } from "../utils/semantic-window-segmentation";
import type { Sentence } from "../utils/sentence-splitter";
import { calculateAdjacentBayesDivergence, type NgramPrior } from "../utils/bayes-divergence";

// ============================================================
// Configuration Types
// ============================================================

export type BayesSegmenterConfig = {
  /** Target chunk size in characters. Ignored when adaptive=true. */
  targetChunkSize?: number;
  /** Minimum chunk size in characters. */
  minChunkSize?: number;
  /** Maximum chunk size in characters. */
  maxChunkSize?: number;
  /** JSD threshold for boundary candidates. */
  bayesThreshold?: number;
  /** Number of sentences to combine per window (default: 5). */
  windowSize?: number;
  /** Adaptive mode with percentile-based boundary selection. */
  adaptive?: boolean;
  /** Percentile used in adaptive mode. */
  bayesPercentile?: number;
  /** Optional prior distribution for domain-specific weighting. */
  prior?: NgramPrior;
  /** Scaling factor for prior influence (default: 1.0). */
  priorWeight?: number;
};

// ============================================================
// Constants
// ============================================================

const DEFAULT_TARGET_SIZE = 500;
const DEFAULT_MIN_SIZE = 100;
const DEFAULT_MAX_SIZE = 2000;
const DEFAULT_BAYES_THRESHOLD = 0.03;
const DEFAULT_WINDOW_SIZE = 5;
const DEFAULT_BAYES_PERCENTILE = 0.2;
const MIN_ADAPTIVE_THRESHOLD = 0.01;

// ============================================================
// Window Distance Calculation
// ============================================================

function combineSentences(sentences: Sentence[]): string {
  return sentences.map((sentence) => sentence.text).join("");
}

function getWindowEnd(sentences: Sentence[]): number {
  const last = sentences[sentences.length - 1];
  return last?.end ?? 0;
}

/**
 * Calculate Bayesian n-gram divergence between adjacent sentence windows.
 */
export function calculateWindowBayesDivergence(
  prior: NgramPrior | undefined,
  priorWeight: number,
): (sentences: Sentence[], windowSize: number) => WindowDivergenceResult {
  return (sentences: Sentence[], windowSize: number): WindowDivergenceResult => {
    const divergenceValues: number[] = [];
    const windowEndPositions: number[] = [];

    if (sentences.length < windowSize + 1) {
      return { divergenceValues, windowEndPositions };
    }

    const windows: string[] = [];
    const windowEnds: number[] = [];

    for (const [i] of sentences.entries()) {
      if (i > sentences.length - windowSize) {
        break;
      }
      const window = sentences.slice(i, i + windowSize);
      windows.push(combineSentences(window));
      windowEnds.push(getWindowEnd(window));
    }

    const adjacentDivergences = calculateAdjacentBayesDivergence(windows, {
      prior,
      priorWeight,
    });

    for (const [i, divergence] of adjacentDivergences.entries()) {
      const windowEnd = windowEnds[i];
      if (windowEnd !== undefined) {
        divergenceValues.push(divergence);
        windowEndPositions.push(windowEnd);
      }
    }

    return { divergenceValues, windowEndPositions };
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Segment text using Bayesian n-gram divergence detection.
 *
 * Uses Jensen-Shannon divergence between adjacent sentence windows,
 * optionally weighted by a domain-specific prior.
 */
export function segmentByBayes(text: string, config: BayesSegmenterConfig = {}): SegmentPoint[] {
  const normalizedConfig: WindowSegmentationConfig = {
    targetChunkSize: config.targetChunkSize ?? DEFAULT_TARGET_SIZE,
    minChunkSize: config.minChunkSize ?? DEFAULT_MIN_SIZE,
    maxChunkSize: config.maxChunkSize ?? DEFAULT_MAX_SIZE,
    threshold: config.bayesThreshold ?? DEFAULT_BAYES_THRESHOLD,
    windowSize: config.windowSize ?? DEFAULT_WINDOW_SIZE,
    adaptive: config.adaptive ?? false,
    percentile: config.bayesPercentile ?? DEFAULT_BAYES_PERCENTILE,
    minimumAdaptiveThreshold: MIN_ADAPTIVE_THRESHOLD,
  };

  return segmentByWindowDivergence({
    text,
    config: normalizedConfig,
    calculateWindowDivergence: calculateWindowBayesDivergence(config.prior, config.priorWeight ?? 1.0),
  });
}

/**
 * Stream segment points using Bayesian n-gram divergence segmentation.
 */
export async function* streamSegmentByBayes(
  text: string,
  config: BayesSegmenterConfig = {}
): AsyncGenerator<SegmentPointStreamEvent> {
  const points = segmentByBayes(text, config);

  for (const [i, point] of points.entries()) {
    yield { type: "segment", point, index: i };
  }

  yield { type: "done", points };
}
