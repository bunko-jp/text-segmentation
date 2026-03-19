/**
 * @file Text Segmentation Library
 *
 * Provides multiple segmentation strategies for splitting documents
 * into semantic or structural chunks.
 *
 * Strategies:
 * - Punctuation Strategy: Simple algorithmic splitting at sentence boundaries
 * - Compression Strategy: Uses NCD for semantic boundary detection without API calls
 * - TF-IDF Strategy: Uses lexical divergence for semantic boundary detection
 * - NCD+TF-IDF Strategy: Uses combined divergence from both methods
 */

// ============================================================
// Core Types (re-exported from internal modules)
// ============================================================

export type { SegmentType, SegmentPoint, SegmentPointStreamEvent } from "./utils/semantic-window-segmentation";

// ============================================================
// API-level Types (defined here as they are only used at the public boundary)
// ============================================================

import type { SegmentType, SegmentPoint, SegmentPointStreamEvent } from "./utils/semantic-window-segmentation";

/**
 * Full segment with extracted text content
 */
export type TextSegment = {
  text: string;
  start: number;
  end: number;
  type: SegmentType;
  /** Heading text if this is a section under a heading */
  headingText?: string;
};

/**
 * Event emitted during streaming segmentation (with text)
 */
export type SegmentationStreamEvent =
  | { type: "segment"; segment: TextSegment; index: number }
  | { type: "done"; segments: TextSegment[] };

/**
 * Common interface for segmentation strategies
 */
export type SegmentationStrategy = {
  name: string;
  /** Segment text and return points */
  segment(text: string): SegmentPoint[];
  /** Stream segment points */
  streamSegmentPoints?(text: string): AsyncGenerator<SegmentPointStreamEvent>;
};

// ============================================================
// Sentence Splitter (shared utility)
// ============================================================

export { splitIntoSentences, type Sentence, type SplitIntoSentencesOptions } from "./utils/sentence-splitter";

// ============================================================
// Punctuation-based Strategy
// ============================================================

export {
  segmentByPunctuation,
  streamSegmentByPunctuation,
  type PunctuationChunkerConfig,
} from "./strategies/punctuation";

// ============================================================
// Compression-based Strategy
// ============================================================

export {
  segmentByCompression,
  streamSegmentByCompression,
  type CompressionSegmenterConfig,
} from "./strategies/compression";

// ============================================================
// TF-IDF based Strategy
// ============================================================

export {
  segmentByTfidf,
  streamSegmentByTfidf,
  type TfidfSegmenterConfig,
} from "./strategies/tfidf";

// ============================================================
// NCD+TF-IDF combined Strategy
// ============================================================

export {
  segmentByNcdTfidf,
  streamSegmentByNcdTfidf,
  type NcdTfidfSegmenterConfig,
} from "./strategies/ncd-tfidf";
