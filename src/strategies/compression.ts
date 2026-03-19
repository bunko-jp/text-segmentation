/**
 * @file Compression-based Semantic Segmentation
 *
 * Uses Normalized Compression Distance (NCD) between adjacent sentence windows
 * to detect semantic boundaries.
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

// ============================================================
// Configuration Types
// ============================================================

export type CompressionSegmenterConfig = {
  /** Target chunk size in characters. Ignored when adaptive=true. */
  targetChunkSize?: number;
  /** Minimum chunk size in characters. */
  minChunkSize?: number;
  /** Maximum chunk size in characters. */
  maxChunkSize?: number;
  /** NCD threshold for boundary candidates. */
  ncdThreshold?: number;
  /** Number of sentences per window for NCD computation. */
  windowSize?: number;
  /** Adaptive mode with percentile-based boundary selection. */
  adaptive?: boolean;
  /** Percentile used in adaptive mode. */
  ncdPercentile?: number;
};

// ============================================================
// Constants
// ============================================================

const DEFAULT_TARGET_SIZE = 500;
const DEFAULT_MIN_SIZE = 100;
const DEFAULT_MAX_SIZE = 2000;
const DEFAULT_NCD_THRESHOLD = 0.4;
const DEFAULT_WINDOW_SIZE = 3;
const DEFAULT_NCD_PERCENTILE = 0.2;
const MIN_ADAPTIVE_THRESHOLD = 0.15;

// ============================================================
// NCD Window Calculations
// ============================================================

function combineSentences(sentences: Sentence[]): string {
  return sentences.map((sentence) => sentence.text).join("");
}

function getWindowEnd(sentences: Sentence[]): number {
  const last = sentences[sentences.length - 1];
  return last?.end ?? 0;
}

/**
 * Calculate NCD between adjacent sentence windows.
 */
export function calculateWindowNcds(sentences: Sentence[], windowSize: number): WindowDivergenceResult {
  const divergenceValues: number[] = [];
  const windowEndPositions: number[] = [];

  if (sentences.length < windowSize + 1) {
    return { divergenceValues, windowEndPositions };
  }

  for (const [i] of sentences.entries()) {
    if (i > sentences.length - windowSize - 1) {
      break;
    }
    const window1 = sentences.slice(i, i + windowSize);
    const window2 = sentences.slice(i + 1, i + 1 + windowSize);

    const text1 = combineSentences(window1);
    const text2 = combineSentences(window2);

    divergenceValues.push(ncd(text1, text2));
    windowEndPositions.push(getWindowEnd(window1));
  }

  return { divergenceValues, windowEndPositions };
}

// ============================================================
// Public API
// ============================================================

/**
 * Segment text using compression-based semantic detection.
 */
export function segmentByCompression(text: string, config: CompressionSegmenterConfig = {}): SegmentPoint[] {
  const normalizedConfig: WindowSegmentationConfig = {
    targetChunkSize: config.targetChunkSize ?? DEFAULT_TARGET_SIZE,
    minChunkSize: config.minChunkSize ?? DEFAULT_MIN_SIZE,
    maxChunkSize: config.maxChunkSize ?? DEFAULT_MAX_SIZE,
    threshold: config.ncdThreshold ?? DEFAULT_NCD_THRESHOLD,
    windowSize: config.windowSize ?? DEFAULT_WINDOW_SIZE,
    adaptive: config.adaptive ?? false,
    percentile: config.ncdPercentile ?? DEFAULT_NCD_PERCENTILE,
    minimumAdaptiveThreshold: MIN_ADAPTIVE_THRESHOLD,
  };

  return segmentByWindowDivergence({
    text,
    config: normalizedConfig,
    calculateWindowDivergence: calculateWindowNcds,
  });
}

/**
 * Stream segment points using compression-based segmentation.
 */
export async function* streamSegmentByCompression(
  text: string,
  config: CompressionSegmenterConfig = {}
): AsyncGenerator<SegmentPointStreamEvent> {
  const points = segmentByCompression(text, config);

  for (const [i, point] of points.entries()) {
    yield { type: "segment", point, index: i };
  }

  yield { type: "done", points };
}
