/**
 * @file Sentence Splitter
 *
 * Splits text into sentences based on punctuation marks.
 * Delegates boundary detection to sentence-boundary, then converts positions to Sentence objects.
 */

import { findSentenceBoundaries } from "./sentence-boundary";

// ============================================================
// Types
// ============================================================

export type Sentence = {
  /** 1-based index */
  index: number;
  /** The sentence text */
  text: string;
  /** Start position in original text (0-indexed) */
  start: number;
  /** End position in original text (exclusive) */
  end: number;
};

export type SplitIntoSentencesOptions = {
  respectJapaneseQuotes?: boolean;
  quoteSafeMaxLength?: number;
};

// ============================================================
// Functions
// ============================================================

type SplitAccumulator = {
  sentences: Sentence[];
  lastStart: number;
};

/**
 * Split text into sentences based on punctuation.
 * Consecutive punctuation marks are kept together.
 */
export function splitIntoSentences(text: string, startIndex = 1, options: SplitIntoSentencesOptions = {}): Sentence[] {
  const boundaries = findSentenceBoundaries(text, {
    includeClosingBrackets: true,
    respectJapaneseQuotes: options.respectJapaneseQuotes,
    quoteSafeMaxLength: options.quoteSafeMaxLength,
  });

  const { sentences, lastStart } = boundaries.reduce<SplitAccumulator>(
    (acc, endPos) => {
      const sentenceText = text.slice(acc.lastStart, endPos).trim();
      if (sentenceText.length === 0) {
        return { ...acc, lastStart: endPos };
      }
      return {
        sentences: [
          ...acc.sentences,
          {
            index: startIndex + acc.sentences.length,
            text: sentenceText,
            start: acc.lastStart,
            end: endPos,
          },
        ],
        lastStart: endPos,
      };
    },
    { sentences: [], lastStart: 0 }
  );

  if (lastStart < text.length) {
    const remainingText = text.slice(lastStart).trim();
    if (remainingText.length > 0) {
      return [
        ...sentences,
        {
          index: startIndex + sentences.length,
          text: remainingText,
          start: lastStart,
          end: text.length,
        },
      ];
    }
  }

  return sentences;
}
