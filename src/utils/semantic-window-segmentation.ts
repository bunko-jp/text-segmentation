/**
 * @file Window-based semantic segmentation core.
 *
 * Shared implementation for strategies that detect semantic boundaries
 * from divergence scores between adjacent sentence windows.
 */

import { splitIntoSentences, type Sentence } from "./sentence-splitter";
import { findLocalMaxima } from "./compression-distance";

// ============================================================
// Segment Types
// ============================================================

export type SegmentType = "heading" | "section" | "paragraph";

export type SegmentPoint = {
  start: number;
  end: number;
  type: SegmentType;
};

export type SegmentPointStreamEvent =
  | { type: "segment"; point: SegmentPoint; index: number }
  | { type: "done"; points: SegmentPoint[] };

// ============================================================
// Window Segmentation Types
// ============================================================

export type WindowDivergenceResult = {
  divergenceValues: number[];
  windowEndPositions: number[];
};

export type WindowDivergenceCalculator = (sentences: Sentence[], windowSize: number) => WindowDivergenceResult;

export type WindowSegmentationConfig = {
  targetChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
  threshold: number;
  windowSize: number;
  adaptive: boolean;
  percentile: number;
  minimumAdaptiveThreshold: number;
};

export type SegmentByWindowOptions = {
  text: string;
  config: WindowSegmentationConfig;
  calculateWindowDivergence: WindowDivergenceCalculator;
};

type AdaptiveWindowConstraints = {
  textLength: number;
  sentences: Sentence[];
  minSize: number;
  maxSize: number;
  windowSize: number;
  percentile: number;
  minimumAdaptiveThreshold: number;
  calculateWindowDivergence: WindowDivergenceCalculator;
};

type SizeConstraints = {
  textLength: number;
  candidatePositions: number[];
  sentences: Sentence[];
  minSize: number;
  maxSize: number;
  targetSize: number;
};

// ============================================================
// Boundary helpers
// ============================================================

/**
 * Find the nearest sentence boundary to a position.
 */
export function findNearestSentenceEnd(sentences: Sentence[], targetPos: number): number {
  return sentences.reduce(
    (nearest, sentence) => {
      const candidateDistance = Math.abs(sentence.end - targetPos);
      const currentDistance = Math.abs(nearest - targetPos);
      return candidateDistance < currentDistance ? sentence.end : nearest;
    },
    0
  );
}

function sortIfNonEmpty(positions: number[]): number[] {
  if (positions.length === 0) {
    return [];
  }
  return [...positions].sort((a, b) => a - b);
}

function lastElementOr(arr: number[], fallback: number): number {
  if (arr.length === 0) {
    return fallback;
  }
  return arr[arr.length - 1] ?? fallback;
}

/**
 * Convert boundary positions to SegmentPoints.
 */
export function boundariesToSegmentPoints(boundaries: number[], textLength: number): SegmentPoint[] {
  const { points, lastEnd } = boundaries.reduce<{ points: SegmentPoint[]; lastEnd: number }>(
    (acc, end) => {
      if (end <= acc.lastEnd) {
        return acc;
      }
      return {
        points: [...acc.points, { start: acc.lastEnd, end, type: "paragraph" as const }],
        lastEnd: end,
      };
    },
    { points: [], lastEnd: 0 }
  );

  if (lastEnd < textLength) {
    return [...points, { start: lastEnd, end: textLength, type: "paragraph" as const }];
  }
  return points;
}

// ============================================================
// Force-split helpers (recursive, no let)
// ============================================================

function forceSplitBetween(from: number, until: number, maxSize: number, sentences: Sentence[]): number[] {
  if (until - from <= maxSize) {
    return [];
  }

  const target = from + maxSize;
  const splitPoint = findNearestSentenceEnd(sentences, target);

  if (splitPoint > from && splitPoint < until) {
    return [splitPoint, ...forceSplitBetween(splitPoint, until, maxSize, sentences)];
  }

  const forceSplit = Math.min(from + maxSize, until);
  if (forceSplit > from && forceSplit < until) {
    return [forceSplit, ...forceSplitBetween(forceSplit, until, maxSize, sentences)];
  }

  return [];
}

// ============================================================
// Size constraints
// ============================================================

function applySizeConstraints(constraints: SizeConstraints): number[] {
  const { textLength, candidatePositions, sentences, minSize, maxSize, targetSize } = constraints;

  const sortedCandidates = sortIfNonEmpty(candidatePositions);

  const { boundaries, last } = sortedCandidates.reduce<{ boundaries: number[]; last: number }>(
    (acc, pos) => {
      const splits = forceSplitBetween(acc.last, pos, maxSize, sentences);
      const afterSplits = splits.length > 0 ? (splits[splits.length - 1] ?? acc.last) : acc.last;

      const chunkSize = pos - afterSplits;
      if (chunkSize < minSize) {
        return { boundaries: [...acc.boundaries, ...splits], last: afterSplits };
      }

      if (chunkSize >= targetSize || chunkSize > maxSize * 0.8) {
        return { boundaries: [...acc.boundaries, ...splits, pos], last: pos };
      }

      return { boundaries: [...acc.boundaries, ...splits], last: afterSplits };
    },
    { boundaries: [], last: 0 }
  );

  const trailingSplits = forceSplitBetween(last, textLength, maxSize, sentences);
  return [...boundaries, ...trailingSplits];
}

function handleFewSentences(
  text: string,
  sentences: Sentence[],
  config: { targetSize: number; minSize: number; maxSize: number }
): SegmentPoint[] {
  if (text.length <= config.maxSize) {
    return [{ start: 0, end: text.length, type: "paragraph" }];
  }

  const { points, lastStart } = sentences.reduce<{ points: SegmentPoint[]; lastStart: number }>(
    (acc, sentence) => {
      if (sentence.end - acc.lastStart >= config.targetSize) {
        return {
          points: [...acc.points, { start: acc.lastStart, end: sentence.end, type: "paragraph" as const }],
          lastStart: sentence.end,
        };
      }
      return acc;
    },
    { points: [], lastStart: 0 }
  );

  if (lastStart < text.length) {
    if (points.length > 0 && text.length - lastStart < config.minSize) {
      const last = points[points.length - 1];
      if (last) {
        return [...points.slice(0, -1), { ...last, end: text.length }];
      }
    }
    return [...points, { start: lastStart, end: text.length, type: "paragraph" as const }];
  }

  return points.length > 0 ? points : [{ start: 0, end: text.length, type: "paragraph" }];
}

// ============================================================
// Adaptive segmentation
// ============================================================

function findDivergenceSubdivisions(
  from: number,
  until: number,
  constraints: AdaptiveWindowConstraints
): number[] {
  const { sentences, windowSize, minimumAdaptiveThreshold, minSize, calculateWindowDivergence } = constraints;

  const chunkSentences = sentences.filter((s) => s.start >= from && s.end <= until);
  if (chunkSentences.length < windowSize + 1) {
    return [];
  }

  const { divergenceValues, windowEndPositions } = calculateWindowDivergence(
    chunkSentences,
    Math.max(1, Math.floor(windowSize / 2))
  );

  if (divergenceValues.length === 0) {
    return [];
  }

  const sortedDivergence = [...divergenceValues].sort((a, b) => b - a);
  const medianIndex = Math.floor(sortedDivergence.length / 2);
  const medianThreshold = sortedDivergence[medianIndex] ?? minimumAdaptiveThreshold;
  const threshold = Math.max(medianThreshold, minimumAdaptiveThreshold);

  const localMaxima = findLocalMaxima(divergenceValues, threshold);
  const candidatePositions = localMaxima
    .map((index) => windowEndPositions[index] ?? 0)
    .filter((boundary) => boundary > from && boundary < until)
    .sort((a, b) => a - b);

  return candidatePositions.reduce<{ result: number[]; previous: number }>(
    (acc, candidate) => {
      if (candidate - acc.previous >= minSize && until - candidate >= minSize) {
        return { result: [...acc.result, candidate], previous: candidate };
      }
      return acc;
    },
    { result: [], previous: from }
  ).result;
}

function findSubdivisionsIfOversized(
  isOversized: boolean,
  from: number,
  until: number,
  constraints: AdaptiveWindowConstraints
): number[] {
  if (!isOversized) {
    return [];
  }
  return findDivergenceSubdivisions(from, until, constraints);
}

function findSplitsIfOversized(
  isOversized: boolean,
  from: number,
  until: number,
  maxSize: number,
  sentences: Sentence[]
): number[] {
  if (!isOversized) {
    return [];
  }
  return forceSplitBetween(from, until, maxSize, sentences);
}

function subdivideOversizedChunks(boundaries: number[], constraints: AdaptiveWindowConstraints): number[] {
  const { textLength, sentences, maxSize } = constraints;
  const allPositions = [...boundaries, textLength];

  return allPositions.reduce<{ result: number[]; lastBoundary: number }>(
    (acc, pos) => {
      const chunkSize = pos - acc.lastBoundary;

      const isOversized = chunkSize > maxSize;
      const subdivisions = findSubdivisionsIfOversized(isOversized, acc.lastBoundary, pos, constraints);
      const lastSubdiv = lastElementOr(subdivisions, acc.lastBoundary);
      const splits = findSplitsIfOversized(isOversized, lastSubdiv, pos, maxSize, sentences);

      const posEntry = pos < textLength ? [pos] : [];

      return {
        result: [...acc.result, ...subdivisions, ...splits, ...posEntry],
        lastBoundary: pos,
      };
    },
    { result: [], lastBoundary: 0 }
  ).result;
}

function segmentAdaptiveByWindowDivergence(sentences: Sentence[], constraints: AdaptiveWindowConstraints): number[] {
  const { textLength, minSize, windowSize, percentile, minimumAdaptiveThreshold, calculateWindowDivergence } =
    constraints;

  const { divergenceValues, windowEndPositions } = calculateWindowDivergence(sentences, windowSize);

  if (divergenceValues.length === 0) {
    return [];
  }

  const sortedDivergence = [...divergenceValues].sort((a, b) => b - a);
  const percentileIndex = Math.max(0, Math.floor(sortedDivergence.length * percentile) - 1);
  const percentileThreshold = sortedDivergence[percentileIndex] ?? minimumAdaptiveThreshold;
  const threshold = Math.max(percentileThreshold, minimumAdaptiveThreshold);

  const maximaIndices = findLocalMaxima(divergenceValues, threshold);
  const candidatePositions = maximaIndices
    .map((index) => windowEndPositions[index] ?? 0)
    .filter((pos) => pos > 0)
    .sort((a, b) => a - b);

  const boundaries = candidatePositions.reduce<{ result: number[]; last: number }>(
    (acc, pos) => {
      if (pos - acc.last < minSize) {
        return acc;
      }
      return { result: [...acc.result, pos], last: pos };
    },
    { result: [], last: 0 }
  ).result;

  return subdivideOversizedChunks(boundaries, { ...constraints, textLength });
}

// ============================================================
// Public API
// ============================================================

/**
 * Generic window-divergence semantic segmentation.
 */
export function segmentByWindowDivergence(opts: SegmentByWindowOptions): SegmentPoint[] {
  const { text, config, calculateWindowDivergence } = opts;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  if (trimmed.length <= config.minChunkSize) {
    return [{ start: 0, end: text.length, type: "paragraph" }];
  }

  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) {
    return [{ start: 0, end: text.length, type: "paragraph" }];
  }

  if (sentences.length < config.windowSize + 1) {
    return handleFewSentences(text, sentences, {
      targetSize: config.targetChunkSize,
      minSize: config.minChunkSize,
      maxSize: config.maxChunkSize,
    });
  }

  if (config.adaptive) {
    const adaptiveBoundaries = segmentAdaptiveByWindowDivergence(sentences, {
      textLength: text.length,
      sentences,
      minSize: config.minChunkSize,
      maxSize: config.maxChunkSize,
      windowSize: config.windowSize,
      percentile: config.percentile,
      minimumAdaptiveThreshold: config.minimumAdaptiveThreshold,
      calculateWindowDivergence,
    });

    const points = boundariesToSegmentPoints(adaptiveBoundaries, text.length);
    return points.length > 0 ? points : [{ start: 0, end: text.length, type: "paragraph" }];
  }

  const { divergenceValues, windowEndPositions } = calculateWindowDivergence(sentences, config.windowSize);
  const maximaIndices = findLocalMaxima(divergenceValues, config.threshold);

  const candidatePositions = maximaIndices
    .map((index) => windowEndPositions[index] ?? 0)
    .filter((position) => position > 0);

  const finalBoundaries = applySizeConstraints({
    textLength: text.length,
    candidatePositions,
    sentences,
    minSize: config.minChunkSize,
    maxSize: config.maxChunkSize,
    targetSize: config.targetChunkSize,
  });

  const points = boundariesToSegmentPoints(finalBoundaries, text.length);
  return points.length > 0 ? points : [{ start: 0, end: text.length, type: "paragraph" }];
}
