/**
 * @file Punctuation-based Chunker
 *
 * Simple segmentation strategy that splits text at sentence boundaries
 * (punctuation marks) and accumulates chunks up to a target size.
 */

import type { SegmentPoint, SegmentPointStreamEvent } from "../utils/semantic-window-segmentation";
import { findSentenceBoundaries as findBoundaries } from "../utils/sentence-boundary";

// ============================================================
// Types
// ============================================================

export type PunctuationChunkerConfig = {
  targetChunkSize?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
};

// ============================================================
// Constants
// ============================================================

const DEFAULT_TARGET_SIZE = 500;
const DEFAULT_MIN_SIZE = 100;
const DEFAULT_MAX_SIZE = 2000;

// ============================================================
// Helpers
// ============================================================

function findSentenceBoundariesWithEnd(text: string): number[] {
  const boundaries = findBoundaries(text);
  const last = boundaries[boundaries.length - 1];
  return last === text.length ? boundaries : [...boundaries, text.length];
}

function forceSplitPoints(from: number, until: number, maxSize: number): SegmentPoint[] {
  if (until - from <= maxSize) {
    return [];
  }
  const end = from + maxSize;
  return [
    { start: from, end, type: "paragraph" as const },
    ...forceSplitPoints(end, until, maxSize),
  ];
}

function buildBoundaryPoint(
  canSplit: boolean,
  chunkStart: number,
  endPos: number | undefined
): SegmentPoint[] {
  if (canSplit && endPos !== undefined) {
    return [{ start: chunkStart, end: endPos, type: "paragraph" }];
  }
  return [];
}

type SplitResult = {
  points: SegmentPoint[];
  chunkStart: number;
};

function splitOversizedChunk(
  chunkStart: number,
  boundary: number,
  lastBoundaryPos: number | undefined,
  lastBoundaryIndex: number,
  minSize: number,
  maxSize: number
): SplitResult {
  const canSplitAtBoundary =
    lastBoundaryPos !== undefined && lastBoundaryIndex > 0 && lastBoundaryPos - chunkStart >= minSize;

  const boundaryPoint: SegmentPoint[] = buildBoundaryPoint(canSplitAtBoundary, chunkStart, lastBoundaryPos);

  const startAfterSplit = canSplitAtBoundary ? lastBoundaryPos : chunkStart;
  const forcePoints = forceSplitPoints(startAfterSplit, boundary, maxSize);
  const finalChunkStart =
    forcePoints.length > 0 ? (forcePoints[forcePoints.length - 1]?.end ?? startAfterSplit) : startAfterSplit;

  return {
    points: [...boundaryPoint, ...forcePoints],
    chunkStart: finalChunkStart,
  };
}

function finalizeRemainingChunk(
  points: SegmentPoint[],
  chunkStart: number,
  text: string,
  minSize: number
): SegmentPoint[] {
  if (chunkStart >= text.length) {
    return points;
  }

  const trimmedRemaining = text.slice(chunkStart).trim();
  if (trimmedRemaining.length === 0) {
    return points;
  }

  const remaining = text.length - chunkStart;
  if (remaining < minSize && points.length > 0) {
    const last = points[points.length - 1];
    if (last) {
      return [...points.slice(0, -1), { ...last, end: text.length }];
    }
  }

  return [...points, { start: chunkStart, end: text.length, type: "paragraph" as const }];
}

// ============================================================
// Implementation
// ============================================================

type ChunkAccumulator = {
  points: SegmentPoint[];
  chunkStart: number;
  lastBoundaryIndex: number;
};

/**
 * Segment text using punctuation-based chunking.
 */
export function segmentByPunctuation(text: string, config: PunctuationChunkerConfig = {}): SegmentPoint[] {
  const targetSize = config.targetChunkSize ?? DEFAULT_TARGET_SIZE;
  const minSize = config.minChunkSize ?? DEFAULT_MIN_SIZE;
  const maxSize = config.maxChunkSize ?? DEFAULT_MAX_SIZE;

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.length <= minSize) {
    return [{ start: 0, end: text.length, type: "paragraph" }];
  }

  const boundaries = findSentenceBoundariesWithEnd(text);

  const acc = boundaries.reduce<ChunkAccumulator>(
    (state, boundary, i) => {
      const currentChunkSize = boundary - state.chunkStart;

      if (currentChunkSize > maxSize) {
        const split = splitOversizedChunk(
          state.chunkStart,
          boundary,
          boundaries[state.lastBoundaryIndex],
          state.lastBoundaryIndex,
          minSize,
          maxSize
        );
        return {
          points: [...state.points, ...split.points],
          chunkStart: split.chunkStart,
          lastBoundaryIndex: i,
        };
      }

      if (currentChunkSize >= targetSize) {
        return {
          points: [...state.points, { start: state.chunkStart, end: boundary, type: "paragraph" as const }],
          chunkStart: boundary,
          lastBoundaryIndex: i,
        };
      }

      return { ...state, lastBoundaryIndex: i };
    },
    { points: [], chunkStart: 0, lastBoundaryIndex: 0 }
  );

  return finalizeRemainingChunk(acc.points, acc.chunkStart, text, minSize);
}

/**
 * Stream segment points using punctuation-based chunking.
 */
export async function* streamSegmentByPunctuation(
  text: string,
  config: PunctuationChunkerConfig = {}
): AsyncGenerator<SegmentPointStreamEvent> {
  const points = segmentByPunctuation(text, config);

  for (const [i, point] of points.entries()) {
    yield { type: "segment", point, index: i };
  }

  yield { type: "done", points };
}
