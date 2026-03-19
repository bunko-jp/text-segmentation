/**
 * @file Integration tests with full Rashomon text
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { segmentByCompression } from "../src/strategies/compression";
import { segmentByTfidf } from "../src/strategies/tfidf";
import { segmentByNcdTfidf } from "../src/strategies/ncd-tfidf";
import { segmentByPunctuation } from "../src/strategies/punctuation";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rashomonPath = resolve(currentDir, "fixtures/rashomon.txt");
const rashomonText = readFileSync(rashomonPath, "utf-8");

function assertFullCoverage(result: Array<{ start: number; end: number }>, textLength: number): void {
  expect(result[0]?.start).toBe(0);
  expect(result[result.length - 1]?.end).toBe(textLength);

  for (const [i, seg] of result.entries()) {
    const prev = result[i - 1];
    if (prev) {
      expect(seg.start).toBe(prev.end);
    }
  }
}

describe("Rashomon full text segmentation", () => {
  describe("segmentByCompression", () => {
    it("segments into reasonable chunks", () => {
      const result = segmentByCompression(rashomonText, {
        targetChunkSize: 400,
        minChunkSize: 100,
        maxChunkSize: 1500,
        ncdThreshold: 0.3,
        windowSize: 3,
      });

      expect(result.length).toBeGreaterThan(5);
      assertFullCoverage(result, rashomonText.length);
    });

    it("produces consistent segment sizes", () => {
      const targetSize = 300;
      const result = segmentByCompression(rashomonText, {
        targetChunkSize: targetSize,
        minChunkSize: 80,
        maxChunkSize: 1000,
        ncdThreshold: 0.3,
        windowSize: 2,
      });

      const sizes = result.map((p) => p.end - p.start);
      const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

      expect(avgSize).toBeGreaterThan(targetSize * 0.5);
      expect(avgSize).toBeLessThan(targetSize * 2);
    });
  });

  describe("segmentByTfidf", () => {
    it("segments into multiple parts with full coverage", () => {
      const result = segmentByTfidf(rashomonText, {
        targetChunkSize: 400,
        minChunkSize: 100,
        maxChunkSize: 1500,
        tfidfThreshold: 0.3,
        windowSize: 3,
      });

      expect(result.length).toBeGreaterThan(3);
      assertFullCoverage(result, rashomonText.length);
    });
  });

  describe("segmentByNcdTfidf", () => {
    it("segments into multiple parts with full coverage", () => {
      const result = segmentByNcdTfidf(rashomonText, {
        targetChunkSize: 400,
        minChunkSize: 100,
        maxChunkSize: 1500,
        ncdTfidfThreshold: 0.3,
        windowSize: 3,
      });

      expect(result.length).toBeGreaterThan(3);
      assertFullCoverage(result, rashomonText.length);
    });
  });

  describe("segmentByPunctuation", () => {
    it("segments into multiple parts with full coverage", () => {
      const result = segmentByPunctuation(rashomonText, {
        targetChunkSize: 400,
        minChunkSize: 100,
        maxChunkSize: 1500,
      });

      expect(result.length).toBeGreaterThan(5);
      assertFullCoverage(result, rashomonText.length);
    });
  });

  describe("strategy comparison", () => {
    it("all strategies produce valid, full-coverage segmentations", () => {
      const config = { targetChunkSize: 500, minChunkSize: 100, maxChunkSize: 2000 };

      const punctuation = segmentByPunctuation(rashomonText, config);
      const compression = segmentByCompression(rashomonText, { ...config, ncdThreshold: 0.3, windowSize: 3 });
      const tfidf = segmentByTfidf(rashomonText, { ...config, tfidfThreshold: 0.3, windowSize: 3 });
      const ncdTfidf = segmentByNcdTfidf(rashomonText, { ...config, ncdTfidfThreshold: 0.3, windowSize: 3 });

      for (const result of [punctuation, compression, tfidf, ncdTfidf]) {
        expect(result.length).toBeGreaterThan(1);
        assertFullCoverage(result, rashomonText.length);
      }
    });
  });
});
