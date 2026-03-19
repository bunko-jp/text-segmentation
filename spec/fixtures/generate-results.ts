/**
 * @file Generate segmentation result fixtures from Rashomon text.
 *
 * Run: bun spec/fixtures/generate-results.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { segmentByPunctuation } from "../../src/strategies/punctuation";
import { segmentByCompression } from "../../src/strategies/compression";
import { segmentByTfidf } from "../../src/strategies/tfidf";
import { segmentByNcdTfidf } from "../../src/strategies/ncd-tfidf";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rashomonText = readFileSync(resolve(currentDir, "rashomon.txt"), "utf-8");
const outDir = resolve(currentDir, "results");
mkdirSync(outDir, { recursive: true });

const config = {
  targetChunkSize: 500,
  minChunkSize: 100,
  maxChunkSize: 2000,
};

type SegmentResult = {
  strategy: string;
  config: Record<string, unknown>;
  textLength: number;
  segmentCount: number;
  segments: Array<{
    index: number;
    start: number;
    end: number;
    length: number;
    text: string;
  }>;
};

function buildResult(
  strategy: string,
  strategyConfig: Record<string, unknown>,
  points: Array<{ start: number; end: number; type: string }>
): SegmentResult {
  return {
    strategy,
    config: strategyConfig,
    textLength: rashomonText.length,
    segmentCount: points.length,
    segments: points.map((p, i) => ({
      index: i,
      start: p.start,
      end: p.end,
      length: p.end - p.start,
      text: rashomonText.slice(p.start, p.end),
    })),
  };
}

function writeResult(filename: string, result: SegmentResult): void {
  writeFileSync(resolve(outDir, filename), JSON.stringify(result, null, 2) + "\n");
}

function avgLength(points: Array<{ start: number; end: number }>): number {
  const total = points.reduce((sum, p) => sum + (p.end - p.start), 0);
  return Math.round(total / points.length);
}

// Punctuation
const punctConfig = { ...config };
const punctResult = segmentByPunctuation(rashomonText, punctConfig);
writeResult("rashomon-punctuation.json", buildResult("punctuation", punctConfig, punctResult));

// Compression
const compConfig = { ...config, ncdThreshold: 0.3, windowSize: 3 };
const compResult = segmentByCompression(rashomonText, compConfig);
writeResult("rashomon-compression.json", buildResult("compression", compConfig, compResult));

// TF-IDF
const tfidfConfig = { ...config, tfidfThreshold: 0.3, windowSize: 3 };
const tfidfResult = segmentByTfidf(rashomonText, tfidfConfig);
writeResult("rashomon-tfidf.json", buildResult("tfidf", tfidfConfig, tfidfResult));

// NCD+TF-IDF
const ncdTfidfConfig = { ...config, ncdTfidfThreshold: 0.3, windowSize: 3, ncdWeight: 0.5, tfidfWeight: 0.5 };
const ncdTfidfResult = segmentByNcdTfidf(rashomonText, ncdTfidfConfig);
writeResult("rashomon-ncd-tfidf.json", buildResult("ncd-tfidf", ncdTfidfConfig, ncdTfidfResult));

console.log("Generated segmentation results:");
console.log(`  punctuation:  ${punctResult.length} segments, avg ${avgLength(punctResult)} chars`);
console.log(`  compression:  ${compResult.length} segments, avg ${avgLength(compResult)} chars`);
console.log(`  tfidf:        ${tfidfResult.length} segments, avg ${avgLength(tfidfResult)} chars`);
console.log(`  ncd-tfidf:    ${ncdTfidfResult.length} segments, avg ${avgLength(ncdTfidfResult)} chars`);
