/**
 * @file NCD + TF-IDF Semantic Segmentation
 *
 * Combines compression-based divergence (NCD) and lexical divergence (TF-IDF
 * cosine distance) between adjacent sentence windows.
 */

import type {
  SegmentPoint,
  SegmentPointStreamEvent,
  WindowDivergenceResult,
  WindowSegmentationConfig,
} from "../utils/semantic-window-segmentation";
import { segmentByWindowDivergence } from "../utils/semantic-window-segmentation";
import type { Sentence } from "../utils/sentence-splitter";
import { ncd } from "../utils/compression-distance";
import { calculateAdjacentTfidfDistance } from "../utils/tfidf-distance";

// ============================================================
// Configuration Types
// ============================================================

export type NcdTfidfSegmenterConfig = {
  /** Target chunk size in characters. Ignored when adaptive=true. */
  targetChunkSize?: number;
  /** Minimum chunk size in characters. */
  minChunkSize?: number;
  /** Maximum chunk size in characters. */
  maxChunkSize?: number;
  /** Combined divergence threshold for boundary candidates. */
  ncdTfidfThreshold?: number;
  /** Number of sentences to combine per window. */
  windowSize?: number;
  /** Adaptive mode with percentile-based boundary selection. */
  adaptive?: boolean;
  /** Percentile used in adaptive mode. */
  ncdTfidfPercentile?: number;
  /** Weight for NCD score in [0, 1]. */
  ncdWeight?: number;
  /** Weight for TF-IDF score in [0, 1]. */
  tfidfWeight?: number;
};

// ============================================================
// Constants
// ============================================================

const DEFAULT_TARGET_SIZE = 500;
const DEFAULT_MIN_SIZE = 100;
const DEFAULT_MAX_SIZE = 2000;
const DEFAULT_NCD_TFIDF_THRESHOLD = 0.42;
const DEFAULT_WINDOW_SIZE = 3;
const DEFAULT_NCD_TFIDF_PERCENTILE = 0.2;
const DEFAULT_NCD_WEIGHT = 0.5;
const DEFAULT_TFIDF_WEIGHT = 0.5;
const MIN_ADAPTIVE_THRESHOLD = 0.13;

// ============================================================
// Helpers
// ============================================================

function combineSentences(sentences: Sentence[]): string {
  return sentences.map((sentence) => sentence.text).join("");
}

function getWindowEnd(sentences: Sentence[]): number {
  const last = sentences[sentences.length - 1];
  return last?.end ?? 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeWeights(ncdWeight: number, tfidfWeight: number): { ncdWeight: number; tfidfWeight: number } {
  const normalizedNcdWeight = clamp01(ncdWeight);
  const normalizedTfidfWeight = clamp01(tfidfWeight);
  const total = normalizedNcdWeight + normalizedTfidfWeight;

  if (total <= 0) {
    return { ncdWeight: DEFAULT_NCD_WEIGHT, tfidfWeight: DEFAULT_TFIDF_WEIGHT };
  }

  return {
    ncdWeight: normalizedNcdWeight / total,
    tfidfWeight: normalizedTfidfWeight / total,
  };
}

function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return values.map(() => 0.5);
  }

  return values.map((value) => (value - min) / (max - min));
}

// ============================================================
// Window Distance Calculation
// ============================================================

/**
 * Calculate combined NCD+TF-IDF distances between adjacent sentence windows.
 */
export function calculateWindowNcdTfidfDistances(
  sentences: Sentence[],
  windowSize: number,
  weights: { ncdWeight: number; tfidfWeight: number }
): WindowDivergenceResult {
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

  const ncdValues: number[] = [];
  for (const [i, current] of windows.entries()) {
    const next = windows[i + 1];
    if (next !== undefined) {
      ncdValues.push(ncd(current, next));
    }
  }

  const tfidfValues = calculateAdjacentTfidfDistance(windows);

  const normalizedNcd = minMaxNormalize(ncdValues);
  const normalizedTfidf = minMaxNormalize(tfidfValues);

  const length = Math.min(normalizedNcd.length, normalizedTfidf.length, windowEnds.length - 1);
  for (const [i] of Array.from({ length }).entries()) {
    const ncdValue = normalizedNcd[i] ?? 0;
    const tfidfValue = normalizedTfidf[i] ?? 0;
    const windowEnd = windowEnds[i];

    if (windowEnd !== undefined) {
      divergenceValues.push(weights.ncdWeight * ncdValue + weights.tfidfWeight * tfidfValue);
      windowEndPositions.push(windowEnd);
    }
  }

  return { divergenceValues, windowEndPositions };
}

// ============================================================
// Public API
// ============================================================

/**
 * Segment text using the NCD+TF-IDF combined strategy.
 */
export function segmentByNcdTfidf(text: string, config: NcdTfidfSegmenterConfig = {}): SegmentPoint[] {
  const weights = normalizeWeights(config.ncdWeight ?? DEFAULT_NCD_WEIGHT, config.tfidfWeight ?? DEFAULT_TFIDF_WEIGHT);

  const normalizedConfig: WindowSegmentationConfig = {
    targetChunkSize: config.targetChunkSize ?? DEFAULT_TARGET_SIZE,
    minChunkSize: config.minChunkSize ?? DEFAULT_MIN_SIZE,
    maxChunkSize: config.maxChunkSize ?? DEFAULT_MAX_SIZE,
    threshold: config.ncdTfidfThreshold ?? DEFAULT_NCD_TFIDF_THRESHOLD,
    windowSize: config.windowSize ?? DEFAULT_WINDOW_SIZE,
    adaptive: config.adaptive ?? false,
    percentile: config.ncdTfidfPercentile ?? DEFAULT_NCD_TFIDF_PERCENTILE,
    minimumAdaptiveThreshold: MIN_ADAPTIVE_THRESHOLD,
  };

  return segmentByWindowDivergence({
    text,
    config: normalizedConfig,
    calculateWindowDivergence: (sentences, windowSize) =>
      calculateWindowNcdTfidfDistances(sentences, windowSize, weights),
  });
}

/**
 * Stream segment points using the NCD+TF-IDF combined strategy.
 */
export async function* streamSegmentByNcdTfidf(
  text: string,
  config: NcdTfidfSegmenterConfig = {}
): AsyncGenerator<SegmentPointStreamEvent> {
  const points = segmentByNcdTfidf(text, config);

  for (const [i, point] of points.entries()) {
    yield { type: "segment", point, index: i };
  }

  yield { type: "done", points };
}
