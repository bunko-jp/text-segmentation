/**
 * @file Sentence Boundary Detection
 *
 * Common utilities for detecting sentence boundaries in text.
 * Supports both Japanese and English punctuation.
 */

// ============================================================
// Punctuation Sets
// ============================================================

export const SENTENCE_TERMINATORS = new Set(["。", "！", "？", "!", "?", "."]);

export const TRAILING_PUNCTUATION = new Set([
  "。", "！", "？", "!", "?", ".",
  "」", "』", "）", "】", "〉", "》", '"', "'", ")", "]",
  "\n", " ",
]);

export const EXTENDED_TERMINATORS = new Set([
  ...SENTENCE_TERMINATORS,
  "」", "』", "）", "】", "〉", "》", '"', "'", ")", "]",
]);

export const DEFAULT_QUOTE_SAFE_MAX_LENGTH = 240;

const QUOTE_OPEN_TO_CLOSE = new Map<string, string>([
  ["「", "」"],
  ["『", "』"],
]);

const QUOTE_CLOSE_TO_OPEN = new Map<string, string>(
  Array.from(QUOTE_OPEN_TO_CLOSE.entries()).map(([open, close]) => [close, open])
);

export type QuoteStackEntry = {
  open: string;
  start: number;
};

/** Update quote stack state for one character. */
export function updateQuoteStack(stack: QuoteStackEntry[], char: string, index: number): void {
  const close = QUOTE_OPEN_TO_CLOSE.get(char);
  if (close) {
    stack.push({ open: char, start: index });
    return;
  }

  const matchingOpen = QUOTE_CLOSE_TO_OPEN.get(char);
  if (!matchingOpen) {
    return;
  }

  const last = stack[stack.length - 1];
  if (last && last.open === matchingOpen) {
    stack.pop();
  }
}

/** Build quote stack state up to endPos (exclusive). */
export function buildQuoteStackUntil(text: string, endPos: number): QuoteStackEntry[] {
  const stack: QuoteStackEntry[] = [];
  for (const match of text.slice(0, endPos).matchAll(/./gsu)) {
    updateQuoteStack(stack, match[0], match.index);
  }
  return stack;
}

/** True when currently inside quote and still under protected length. */
export function isInsideProtectedQuote(stack: QuoteStackEntry[], index: number, maxLength: number): boolean {
  const current = stack[stack.length - 1];
  if (!current) {
    return false;
  }
  return index - current.start < maxLength;
}

// ============================================================
// Boundary Detection
// ============================================================

export type FindBoundariesOptions = {
  includeClosingBrackets?: boolean;
  respectJapaneseQuotes?: boolean;
  quoteSafeMaxLength?: number;
};

const TRAILING_PUNCT_PATTERN = /^[。！？!?.」』）】〉》"')\]\n ]+/;

function consumeTrailingPunctuation(text: string, startPos: number): number {
  const match = TRAILING_PUNCT_PATTERN.exec(text.slice(startPos));
  return match ? startPos + match[0].length : startPos;
}

type ScanState = {
  boundaries: number[];
  skip: number;
};

function scanStep(
  state: ScanState,
  idx: number,
  text: string,
  terminators: Set<string>,
  quoteStack: QuoteStackEntry[],
  respectJapaneseQuotes: boolean,
  quoteSafeMaxLength: number
): ScanState {
  if (idx < state.skip) {
    return state;
  }

  const char = text[idx];
  if (!char) {
    return state;
  }

  if (respectJapaneseQuotes) {
    updateQuoteStack(quoteStack, char, idx);
  }

  const isProtected = respectJapaneseQuotes && isInsideProtectedQuote(quoteStack, idx, quoteSafeMaxLength);

  if (terminators.has(char) && !isProtected) {
    const endPos = consumeTrailingPunctuation(text, idx + 1);
    return { boundaries: [...state.boundaries, endPos], skip: endPos };
  }

  return state;
}

/** Find sentence boundary positions in text. Returns array of end positions (exclusive). */
export function findSentenceBoundaries(text: string, options: FindBoundariesOptions = {}): number[] {
  const terminators = options.includeClosingBrackets ? EXTENDED_TERMINATORS : SENTENCE_TERMINATORS;
  const respectJapaneseQuotes = options.respectJapaneseQuotes ?? true;
  const quoteSafeMaxLength = options.quoteSafeMaxLength ?? DEFAULT_QUOTE_SAFE_MAX_LENGTH;
  const quoteStack: QuoteStackEntry[] = [];

  return Array.from({ length: text.length }, (_, i) => i).reduce<ScanState>(
    (state, idx) => scanStep(state, idx, text, terminators, quoteStack, respectJapaneseQuotes, quoteSafeMaxLength),
    { boundaries: [], skip: 0 }
  ).boundaries;
}

/** Find the next sentence boundary from a given position. */
export function findNextBoundary(text: string, fromPos: number, options: FindBoundariesOptions = {}): number {
  const allBoundaries = findSentenceBoundaries(text, options);
  return allBoundaries.find((b) => b >= fromPos) ?? text.length;
}

/** Check if a position is at a sentence boundary. */
export function isAtBoundary(text: string, pos: number): boolean {
  if (pos <= 0 || pos > text.length) {
    return false;
  }
  const prevChar = text[pos - 1];
  return prevChar !== undefined && TRAILING_PUNCTUATION.has(prevChar);
}
