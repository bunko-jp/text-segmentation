/**
 * @file Lightweight text tokenizer for mixed Japanese/English text.
 *
 * Produces word unigrams and character bigrams without requiring
 * external morphological analyzers.
 */

// ============================================================
// Constants
// ============================================================

const WORD_PATTERN = /[\p{L}\p{N}_-]+/gu;

// ============================================================
// Internal helpers
// ============================================================

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractWordTokens(text: string): string[] {
  const matches = text.match(WORD_PATTERN);
  if (!matches) {
    return [];
  }
  return matches.filter((token) => token.length >= 2);
}

function extractCharacterBigrams(text: string): string[] {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 2) {
    return compact.length === 0 ? [] : [compact];
  }

  return Array.from({ length: compact.length - 1 }, (_, i) => compact.slice(i, i + 2));
}

// ============================================================
// Public API
// ============================================================

/**
 * Tokenize text into word unigrams and character bigrams.
 *
 * Word tokens are extracted via Unicode-aware word boundary matching.
 * Character bigrams provide coverage for CJK text where word boundaries
 * are not marked by whitespace. When word tokens are available, both
 * types are combined; otherwise only bigrams are returned.
 */
export function tokenizeText(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const words = extractWordTokens(normalized);
  const bigrams = extractCharacterBigrams(normalized);

  return words.length === 0 ? bigrams : [...words, ...bigrams];
}
