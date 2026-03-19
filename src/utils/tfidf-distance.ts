/**
 * @file TF-IDF based semantic distance helpers.
 *
 * Uses lightweight tokenization that works for mixed Japanese/English text
 * without external morphological analyzers.
 */

// ============================================================
// Tokenization
// ============================================================

const WORD_PATTERN = /[\p{L}\p{N}_-]+/gu;

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

/**
 * Tokenize text for TF-IDF vectorization.
 */
export function tokenizeTextForTfidf(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const words = extractWordTokens(normalized);
  const bigrams = extractCharacterBigrams(normalized);

  return words.length === 0 ? bigrams : [...words, ...bigrams];
}

// ============================================================
// Vectorization
// ============================================================

function buildTermFrequency(tokens: string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    const current = frequency.get(token) ?? 0;
    frequency.set(token, current + 1);
  }
  return frequency;
}

function buildDocumentFrequency(tokenizedDocuments: string[][]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenizedDocuments) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      const current = documentFrequency.get(token) ?? 0;
      documentFrequency.set(token, current + 1);
    }
  }
  return documentFrequency;
}

function buildTfidfVector(
  tokens: string[],
  documentFrequency: Map<string, number>,
  totalDocs: number
): Map<string, number> {
  if (tokens.length === 0) {
    return new Map();
  }

  const tf = buildTermFrequency(tokens);
  const vector = new Map<string, number>();
  for (const [term, count] of tf) {
    const normalizedTf = count / tokens.length;
    const df = documentFrequency.get(term) ?? 0;
    const idf = Math.log((1 + totalDocs) / (1 + df)) + 1;
    vector.set(term, normalizedTf * idf);
  }
  return vector;
}

function vectorNorm(vector: Map<string, number>): number {
  const sumOfSquares = Array.from(vector.values()).reduce((sum, v) => sum + v * v, 0);
  return Math.sqrt(sumOfSquares);
}

/**
 * Cosine similarity for sparse vectors.
 */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const dot = Array.from(small).reduce((sum, [key, value]) => sum + value * (large.get(key) ?? 0), 0);

  const normA = vectorNorm(a);
  const normB = vectorNorm(b);
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (normA * normB);
}

/**
 * Cosine distance in [0, 1] from sparse vectors.
 */
export function cosineDistance(a: Map<string, number>, b: Map<string, number>): number {
  return Math.max(0, Math.min(1, 1 - cosineSimilarity(a, b)));
}

/**
 * Calculate TF-IDF cosine distances between adjacent texts.
 */
export function calculateAdjacentTfidfDistance(texts: string[]): number[] {
  if (texts.length < 2) {
    return [];
  }

  const tokenized = texts.map((text) => tokenizeTextForTfidf(text));
  const documentFrequency = buildDocumentFrequency(tokenized);
  const totalDocs = tokenized.length;
  const vectors = tokenized.map((tokens) => buildTfidfVector(tokens, documentFrequency, totalDocs));

  return vectors
    .slice(0, -1)
    .map((current, i) => {
      const next = vectors[i + 1];
      return next ? cosineDistance(current, next) : 0;
    });
}
