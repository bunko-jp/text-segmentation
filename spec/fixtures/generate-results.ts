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
import { segmentByBayes } from "../../src/strategies/bayes";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rashomonText = readFileSync(resolve(currentDir, "rashomon.txt"), "utf-8");
const outDir = resolve(currentDir, "results");
mkdirSync(outDir, { recursive: true });

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

// ============================================================
// Punctuation: purely size-based, no semantic detection
// ============================================================
const punctConfig = { targetChunkSize: 500, minChunkSize: 100, maxChunkSize: 2000 };
const punctResult = segmentByPunctuation(rashomonText, punctConfig);
writeResult("rashomon-punctuation.json", buildResult("punctuation", punctConfig, punctResult));

// ============================================================
// Semantic strategies: use adaptive mode with wide size range
// to let semantic boundaries dominate over size constraints
// ============================================================
const semanticBase = { minChunkSize: 100, maxChunkSize: 3000 };

// Compression (NCD)
const compConfig = { ...semanticBase, adaptive: true, ncdPercentile: 0.25, windowSize: 3 };
const compResult = segmentByCompression(rashomonText, compConfig);
writeResult("rashomon-compression.json", buildResult("compression", compConfig, compResult));

// TF-IDF
const tfidfConfig = { ...semanticBase, adaptive: true, tfidfPercentile: 0.25, windowSize: 3 };
const tfidfResult = segmentByTfidf(rashomonText, tfidfConfig);
writeResult("rashomon-tfidf.json", buildResult("tfidf", tfidfConfig, tfidfResult));

// NCD+TF-IDF
const ncdTfidfConfig = { ...semanticBase, adaptive: true, ncdTfidfPercentile: 0.25, windowSize: 3, ncdWeight: 0.5, tfidfWeight: 0.5 };
const ncdTfidfResult = segmentByNcdTfidf(rashomonText, ncdTfidfConfig);
writeResult("rashomon-ncd-tfidf.json", buildResult("ncd-tfidf", ncdTfidfConfig, ncdTfidfResult));

// Bayes (n-gram JSD)
const bayesConfig = { ...semanticBase, adaptive: true, bayesPercentile: 0.25, windowSize: 3 };
const bayesResult = segmentByBayes(rashomonText, bayesConfig);
writeResult("rashomon-bayes.json", buildResult("bayes", bayesConfig, bayesResult));

console.log("Generated segmentation results:");
console.log(`  punctuation:  ${punctResult.length} segments, avg ${avgLength(punctResult)} chars`);
console.log(`  compression:  ${compResult.length} segments, avg ${avgLength(compResult)} chars`);
console.log(`  tfidf:        ${tfidfResult.length} segments, avg ${avgLength(tfidfResult)} chars`);
console.log(`  ncd-tfidf:    ${ncdTfidfResult.length} segments, avg ${avgLength(ncdTfidfResult)} chars`);
console.log(`  bayes:        ${bayesResult.length} segments, avg ${avgLength(bayesResult)} chars`);

console.log("\nBoundary positions (end):");
console.log(`  punctuation:  ${punctResult.map((p) => p.end).join(", ")}`);
console.log(`  compression:  ${compResult.map((p) => p.end).join(", ")}`);
console.log(`  tfidf:        ${tfidfResult.map((p) => p.end).join(", ")}`);
console.log(`  ncd-tfidf:    ${ncdTfidfResult.map((p) => p.end).join(", ")}`);
console.log(`  bayes:        ${bayesResult.map((p) => p.end).join(", ")}`);
