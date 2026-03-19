/**
 * @file TF-IDF based Semantic Segmentation
 *
 * Uses TF-IDF cosine distance between adjacent sentence windows to detect
 * semantic boundaries without LLM calls.
 */

import type {
  SegmentPoint,
  SegmentPointStreamEvent,
  WindowDivergenceResult,
  WindowSegmentationConfig,
} from "../utils/semantic-window-segmentation";
import { segmentByWindowDivergence } from "../utils/semantic-window-segmentation";
import type { Sentence } from "../utils/sentence-splitter";
import { calculateAdjacentTfidfDistance } from "../utils/tfidf-distance";

// ============================================================
// Configuration Types
// ============================================================

export type TfidfSegmenterConfig = {
  /** Target chunk size in characters. Ignored when adaptive=true. */
  targetChunkSize?: number;
  /** Minimum chunk size in characters. */
  minChunkSize?: number;
  /** Maximum chunk size in characters. */
  maxChunkSize?: number;
  /** TF-IDF cosine distance threshold for boundary candidates. */
  tfidfThreshold?: number;
  /** Number of sentences to combine per window. */
  windowSize?: number;
  /** Adaptive mode with percentile-based boundary selection. */
  adaptive?: boolean;
  /** Percentile used in adaptive mode. */
  tfidfPercentile?: number;
};

// ============================================================
// Constants
// ============================================================

const DEFAULT_TARGET_SIZE = 500;
const DEFAULT_MIN_SIZE = 100;
const DEFAULT_MAX_SIZE = 2000;
const DEFAULT_TFIDF_THRESHOLD = 0.45;
const DEFAULT_WINDOW_SIZE = 3;
const DEFAULT_TFIDF_PERCENTILE = 0.2;
const MIN_ADAPTIVE_THRESHOLD = 0.12;

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
 * Calculate TF-IDF cosine distances between adjacent sentence windows.
 */
export function calculateWindowTfidfDistances(sentences: Sentence[], windowSize: number): WindowDivergenceResult {
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

  const adjacentDistances = calculateAdjacentTfidfDistance(windows);
  for (const [i, distance] of adjacentDistances.entries()) {
    const windowEnd = windowEnds[i];
    if (windowEnd !== undefined) {
      divergenceValues.push(distance);
      windowEndPositions.push(windowEnd);
    }
  }

  return { divergenceValues, windowEndPositions };
}

// ============================================================
// Public API
// ============================================================

/**
 * Segment text using TF-IDF based semantic detection.
 */
export function segmentByTfidf(text: string, config: TfidfSegmenterConfig = {}): SegmentPoint[] {
  const normalizedConfig: WindowSegmentationConfig = {
    targetChunkSize: config.targetChunkSize ?? DEFAULT_TARGET_SIZE,
    minChunkSize: config.minChunkSize ?? DEFAULT_MIN_SIZE,
    maxChunkSize: config.maxChunkSize ?? DEFAULT_MAX_SIZE,
    threshold: config.tfidfThreshold ?? DEFAULT_TFIDF_THRESHOLD,
    windowSize: config.windowSize ?? DEFAULT_WINDOW_SIZE,
    adaptive: config.adaptive ?? false,
    percentile: config.tfidfPercentile ?? DEFAULT_TFIDF_PERCENTILE,
    minimumAdaptiveThreshold: MIN_ADAPTIVE_THRESHOLD,
  };

  return segmentByWindowDivergence({
    text,
    config: normalizedConfig,
    calculateWindowDivergence: calculateWindowTfidfDistances,
  });
}

/**
 * Stream segment points using TF-IDF based segmentation.
 */
export async function* streamSegmentByTfidf(
  text: string,
  config: TfidfSegmenterConfig = {}
): AsyncGenerator<SegmentPointStreamEvent> {
  const points = segmentByTfidf(text, config);

  for (const [i, point] of points.entries()) {
    yield { type: "segment", point, index: i };
  }

  yield { type: "done", points };
}
