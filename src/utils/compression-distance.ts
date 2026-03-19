/**
 * @file Compression-based Distance Calculation
 *
 * Implements Normalized Compression Distance (NCD) for measuring semantic similarity.
 * Based on "Low-Resource Text Classification: A Parameter-Free Classification Method with Compressors"
 *
 * NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y))
 * - C(x): compressed size of text x
 * - Value range: 0 (identical) to ~1 (completely different)
 */

import { deflateSync } from "fflate";

// ============================================================
// Constants
// ============================================================

const encoder = new TextEncoder();

// ============================================================
// Core Functions
// ============================================================

/**
 * Compress text using deflate algorithm.
 *
 * @param text - The text to compress
 * @returns Compressed bytes
 */
export function compress(text: string): Uint8Array {
  const bytes = encoder.encode(text);
  return deflateSync(bytes);
}

/**
 * Get the compressed size of text in bytes.
 *
 * @param text - The text to measure
 * @returns Compressed size in bytes
 */
export function compressedSize(text: string): number {
  return compress(text).length;
}

/**
 * Calculate Normalized Compression Distance between two texts.
 *
 * NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y))
 *
 * @param a - First text
 * @param b - Second text
 * @returns NCD value between 0 (identical) and ~1 (completely different)
 */
export function ncd(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0 || b.length === 0) {
    return 1;
  }

  const cA = compressedSize(a);
  const cB = compressedSize(b);
  const cAB = compressedSize(a + b);

  const minC = Math.min(cA, cB);
  const maxC = Math.max(cA, cB);

  if (maxC === 0) {
    return 0;
  }

  return (cAB - minC) / maxC;
}

/**
 * Calculate NCD values for sliding window of adjacent texts.
 *
 * For texts [a, b, c, d], calculates:
 * - ncd(a, b)
 * - ncd(b, c)
 * - ncd(c, d)
 *
 * @param texts - Array of text segments
 * @returns Array of NCD values (length = texts.length - 1)
 */
export function calculateAdjacentNcd(texts: string[]): number[] {
  if (texts.length < 2) {
    return [];
  }

  const results: number[] = [];
  for (const [i, a] of texts.entries()) {
    const b = texts[i + 1];
    if (b !== undefined) {
      results.push(ncd(a, b));
    }
  }

  return results;
}

/**
 * Find local maxima in NCD values (potential segment boundaries).
 *
 * A local maximum at index i means the texts at i and i+1 have
 * higher dissimilarity than their neighbors.
 *
 * @param ncdValues - Array of NCD values from calculateAdjacentNcd
 * @param threshold - Minimum NCD value to consider as a boundary (default: 0.3)
 * @returns Indices of local maxima (boundary positions)
 */
export function findLocalMaxima(ncdValues: number[], threshold = 0.3): number[] {
  if (ncdValues.length < 2) {
    return [];
  }

  const maxima: number[] = [];

  for (const [i, current] of ncdValues.entries()) {
    if (current < threshold) {
      continue;
    }

    const prev = i > 0 ? (ncdValues[i - 1] ?? 0) : 0;
    const next = i < ncdValues.length - 1 ? (ncdValues[i + 1] ?? 0) : 0;

    // Local maximum: current > prev AND current >= next
    // (Use >= for next to handle plateaus)
    if (current > prev && current >= next) {
      maxima.push(i);
    }
  }

  return maxima;
}
