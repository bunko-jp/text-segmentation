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
    preview: string;
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
      preview: rashomonText.slice(p.start, Math.min(p.start + 60, p.end)).replace(/\n/g, "\\n") + (p.end - p.start > 60 ? "..." : ""),
    })),
  };
}

// Punctuation
const punctConfig = { ...config };
const punctResult = segmentByPunctuation(rashomonText, punctConfig);
writeFileSync(
  resolve(outDir, "rashomon-punctuation.json"),
  JSON.stringify(buildResult("punctuation", punctConfig, punctResult), null, 2) + "\n"
);

// Compression
const compConfig = { ...config, ncdThreshold: 0.3, windowSize: 3 };
const compResult = segmentByCompression(rashomonText, compConfig);
writeFileSync(
  resolve(outDir, "rashomon-compression.json"),
  JSON.stringify(buildResult("compression", compConfig, compResult), null, 2) + "\n"
);

// TF-IDF
const tfidfConfig = { ...config, tfidfThreshold: 0.3, windowSize: 3 };
const tfidfResult = segmentByTfidf(rashomonText, tfidfConfig);
writeFileSync(
  resolve(outDir, "rashomon-tfidf.json"),
  JSON.stringify(buildResult("tfidf", tfidfConfig, tfidfResult), null, 2) + "\n"
);

// NCD+TF-IDF
const ncdTfidfConfig = { ...config, ncdTfidfThreshold: 0.3, windowSize: 3, ncdWeight: 0.5, tfidfWeight: 0.5 };
const ncdTfidfResult = segmentByNcdTfidf(rashomonText, ncdTfidfConfig);
writeFileSync(
  resolve(outDir, "rashomon-ncd-tfidf.json"),
  JSON.stringify(buildResult("ncd-tfidf", ncdTfidfConfig, ncdTfidfResult), null, 2) + "\n"
);

console.log("Generated segmentation results:");
console.log(`  punctuation:  ${punctResult.length} segments`);
console.log(`  compression:  ${compResult.length} segments`);
console.log(`  tfidf:        ${tfidfResult.length} segments`);
console.log(`  ncd-tfidf:    ${ncdTfidfResult.length} segments`);
