/**
 * @file Unit tests for Bayesian n-gram divergence.
 */

import { calculateAdjacentBayesDivergence, type NgramPrior } from "./bayes-divergence";

describe("calculateAdjacentBayesDivergence", () => {
  it("returns empty for fewer than 2 texts", () => {
    expect(calculateAdjacentBayesDivergence([])).toEqual([]);
    expect(calculateAdjacentBayesDivergence(["hello"])).toEqual([]);
  });

  it("returns zero for identical texts", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    const result = calculateAdjacentBayesDivergence([text, text]);
    expect(result).toHaveLength(1);
    // Small non-zero value due to Laplace smoothing in mixture distribution
    expect(result[0]).toBeLessThan(0.01);
  });

  it("returns higher divergence for dissimilar texts", () => {
    const textA = "The stars shine brightly in the night sky. Astronomers study galaxies and nebulae far away.";
    const textB = "The stars shine brightly in the night sky. Astronomers study galaxies and nebulae far away.";
    const textC = "Cooking pasta requires boiling water. Add salt and olive oil for flavor. Serve with tomato sauce.";

    const result = calculateAdjacentBayesDivergence([textA, textB, textC]);
    expect(result).toHaveLength(2);

    // A→B should be low (same topic), B→C should be high (topic change)
    expect(result[1]).toBeGreaterThan(result[0]);
  });

  it("returns values in [0, 1] range", () => {
    const texts = [
      "Legal disclaimers and copyright notices apply to this document.",
      "The forest was dark and quiet. Birds sang in the distance.",
      "Mathematical proofs require axioms, lemmas, and theorems.",
    ];

    const result = calculateAdjacentBayesDivergence(texts);
    for (const score of result) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("returns correct number of scores", () => {
    const texts = Array.from({ length: 5 }, (_, i) => `Text segment number ${i} with some words.`);
    const result = calculateAdjacentBayesDivergence(texts);
    expect(result).toHaveLength(4);
  });

  describe("with prior", () => {
    const legalPrior: NgramPrior = new Map([
      ["license", 3.0],
      ["copyright", 3.0],
      ["trademark", 3.0],
      ["gutenberg", 4.0],
      ["ebook", 3.0],
      ["warranty", 2.5],
      ["disclaimer", 2.5],
    ]);

    it("amplifies divergence at prior-weighted vocabulary boundaries", () => {
      const legalText = "This ebook is provided under the Project Gutenberg license. Copyright and trademark notices apply. No warranty is provided.";
      const storyText = "The hero walked through the ancient forest, listening to the wind in the trees. She found a hidden path among the rocks.";

      const withPrior = calculateAdjacentBayesDivergence([legalText, storyText], { prior: legalPrior });
      const withoutPrior = calculateAdjacentBayesDivergence([legalText, storyText]);

      expect(withPrior[0]).toBeGreaterThan(withoutPrior[0]);
    });

    it("has no effect when priorWeight is 0", () => {
      const texts = [
        "License and copyright notices for this ebook.",
        "The forest was dark and the moon was full.",
      ];

      const withZeroWeight = calculateAdjacentBayesDivergence(texts, { prior: legalPrior, priorWeight: 0 });
      const withoutPrior = calculateAdjacentBayesDivergence(texts);

      expect(withZeroWeight[0]).toBeCloseTo(withoutPrior[0], 10);
    });

    it("stronger priorWeight increases divergence at prior boundaries", () => {
      const texts = [
        "This ebook has a Gutenberg license and copyright disclaimer.",
        "The hero walked through mountains and valleys in the story.",
      ];

      const weak = calculateAdjacentBayesDivergence(texts, { prior: legalPrior, priorWeight: 0.5 });
      const strong = calculateAdjacentBayesDivergence(texts, { prior: legalPrior, priorWeight: 2.0 });

      expect(strong[0]).toBeGreaterThan(weak[0]);
    });
  });

  describe("handles edge cases", () => {
    it("handles empty texts", () => {
      const result = calculateAdjacentBayesDivergence(["", ""]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(0);
    });

    it("handles texts with only whitespace", () => {
      const result = calculateAdjacentBayesDivergence(["   ", "   "]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(0);
    });

    it("handles mixed Japanese and English", () => {
      const japanese = "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。";
      const english = "I am a cat. I have no name yet. I have no idea where I was born.";

      const result = calculateAdjacentBayesDivergence([japanese, english]);
      expect(result).toHaveLength(1);
      expect(result[0]).toBeGreaterThan(0);
    });
  });
});
