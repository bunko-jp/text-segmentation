# text-segmentation

Split text into semantic or structural chunks using purely algorithmic strategies. No LLM or external API dependencies. Supports mixed Japanese/English text.

## Install

```bash
npm install @bunkojp/text-segmentation
```

## Quick Start

```ts
import { segmentByNcdTfidf } from "@bunkojp/text-segmentation";

const text = `Today the weather is nice. I went for a walk. I saw flowers in the park.

Yesterday I went to the supermarket. I bought vegetables and meat. I cooked dinner.`;

const segments = segmentByNcdTfidf(text, {
  targetChunkSize: 80,
  minChunkSize: 20,
  maxChunkSize: 300,
  windowSize: 2,
});

for (const seg of segments) {
  console.log(`[${seg.start}:${seg.end}]`, text.slice(seg.start, seg.end));
}
```

## Strategies

Four segmentation strategies are provided, listed from fastest/simplest to most semantically accurate.

### Punctuation

Accumulates sentences up to a target size and splits at sentence boundaries. The fastest strategy.

```ts
import { segmentByPunctuation } from "@bunkojp/text-segmentation";

const segments = segmentByPunctuation(text, {
  targetChunkSize: 500,  // Target chunk size in characters
  minChunkSize: 100,     // Minimum chunk size
  maxChunkSize: 2000,    // Hard limit on chunk size
});
```

### Compression (NCD)

Computes Normalized Compression Distance between adjacent sentence windows to detect semantic boundaries.

```ts
import { segmentByCompression } from "@bunkojp/text-segmentation";

const segments = segmentByCompression(text, {
  targetChunkSize: 500,
  minChunkSize: 100,
  maxChunkSize: 2000,
  ncdThreshold: 0.4,    // Boundary detection threshold (higher = fewer splits)
  windowSize: 3,        // Number of sentences per window
  adaptive: false,      // Set true for percentile-based automatic thresholding
  ncdPercentile: 0.2,   // Percentile used in adaptive mode
});
```

### TF-IDF

Uses TF-IDF cosine distance between adjacent sentence windows. Strong at detecting lexical topic shifts.

```ts
import { segmentByTfidf } from "@bunkojp/text-segmentation";

const segments = segmentByTfidf(text, {
  targetChunkSize: 500,
  minChunkSize: 100,
  maxChunkSize: 2000,
  tfidfThreshold: 0.45,
  windowSize: 3,
  adaptive: false,
  tfidfPercentile: 0.2,
});
```

### NCD + TF-IDF

Weighted combination of compression distance and TF-IDF cosine distance. The most robust strategy.

```ts
import { segmentByNcdTfidf } from "@bunkojp/text-segmentation";

const segments = segmentByNcdTfidf(text, {
  targetChunkSize: 500,
  minChunkSize: 100,
  maxChunkSize: 2000,
  ncdTfidfThreshold: 0.42,
  windowSize: 3,
  ncdWeight: 0.5,       // Weight for NCD component
  tfidfWeight: 0.5,     // Weight for TF-IDF component
  adaptive: false,
  ncdTfidfPercentile: 0.2,
});
```

## Streaming

All strategies provide an `AsyncGenerator`-based streaming API.

```ts
import { streamSegmentByCompression } from "@bunkojp/text-segmentation";

for await (const event of streamSegmentByCompression(text)) {
  if (event.type === "segment") {
    console.log(`Segment #${event.index}:`, event.point);
  }
  if (event.type === "done") {
    console.log("Total segments:", event.points.length);
  }
}
```

## Types

```ts
type SegmentPoint = {
  start: number;   // Start position (inclusive)
  end: number;     // End position (exclusive)
  type: "heading" | "section" | "paragraph";
};
```

Use `text.slice(segment.start, segment.end)` to extract segment text. All segments are contiguous with no gaps and cover the entire input text.

## Utilities

The sentence splitter is also available as a standalone utility.

```ts
import { splitIntoSentences } from "@bunkojp/text-segmentation";

const sentences = splitIntoSentences("First sentence. Second sentence.");
// [{ index: 1, text: "First sentence.", start: 0, end: 16 }, ...]
```

## Example Results

Pre-generated segmentation results for Akutagawa Ryunosuke's "Rashomon" (5,839 characters) are included in [`spec/fixtures/results/`](spec/fixtures/results/). Each JSON file contains the strategy name, configuration, and full segment list with positions and full text content.

All four strategies produce 11 segments with `targetChunkSize=500`, but their **boundary positions differ** — each strategy detects topic shifts at different points in the text.

| Strategy | Result | Boundaries (end positions) |
|----------|--------|----------------------------|
| [Punctuation](spec/fixtures/results/rashomon-punctuation.json) | 11 segments | 506, 1030, 1591, 2101, 2645, 3173, 3700, 4214, 4962, 5489 |
| [Compression](spec/fixtures/results/rashomon-compression.json) | 11 segments | 551, 1106, 1621, 2348, 2926, 3553, 4130, 4702, 5248, 5820 |
| [TF-IDF](spec/fixtures/results/rashomon-tfidf.json) | 11 segments | 506, 1030, 1621, 2300, 2882, 3553, 4130, 4702, 5248, 5820 |
| [NCD+TF-IDF](spec/fixtures/results/rashomon-ncd-tfidf.json) | 11 segments | 506, 1030, 1621, 2300, 2882, 3553, 4130, 4702, 5248, 5820 |

To regenerate these results:

```bash
bun spec/fixtures/generate-results.ts
```

## How It Works

The semantic strategies (Compression, TF-IDF, NCD+TF-IDF) share a common window-based algorithm:

1. Split text into sentences
2. Create sliding windows of N sentences
3. Compute divergence between adjacent windows
4. Select local maxima as boundary candidates
5. Apply size constraints (min/max/target)

**Adaptive mode** replaces fixed thresholds with percentile-based automatic threshold selection and recursively subdivides oversized chunks.

## License

[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)
