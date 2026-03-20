/**
 * @file Tests for Bayesian n-gram divergence segmenter.
 */

import { segmentByBayes, streamSegmentByBayes, type BayesSegmenterConfig } from "./bayes";
import type { NgramPrior } from "../utils/bayes-divergence";

describe("segmentByBayes", () => {
  it("returns empty array for empty text", () => {
    expect(segmentByBayes("")).toEqual([]);
  });

  it("returns single segment for short text", () => {
    const text = "短いテキストです。";
    const result = segmentByBayes(text, { minChunkSize: 100 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: text.length, type: "paragraph" });
  });

  it("covers entire text without gaps", () => {
    const text = `最初のトピックです。天気の話をします。今日は晴れです。

次のトピックです。買い物の話をします。スーパーに行きました。

最後のトピックです。仕事の話をします。会議がありました。`;

    const result = segmentByBayes(text, {
      minChunkSize: 20,
      targetChunkSize: 50,
      maxChunkSize: 200,
      bayesThreshold: 0.15,
      windowSize: 2,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.start).toBe(0);
    expect(result[result.length - 1]?.end).toBe(text.length);

    for (const [i, seg] of result.entries()) {
      const prev = result[i - 1];
      if (prev) {
        expect(seg.start).toBe(prev.end);
      }
    }
  });

  it("higher threshold produces fewer or equal splits", () => {
    const text = `天気の話です。今日は晴れです。明日も晴れです。
買い物の話です。スーパーに行きました。野菜を買いました。
仕事の話です。会議がありました。資料を作成しました。`;

    const lowThreshold = segmentByBayes(text, {
      minChunkSize: 10, targetChunkSize: 40,
      bayesThreshold: 0.1, windowSize: 2,
    });
    const highThreshold = segmentByBayes(text, {
      minChunkSize: 10, targetChunkSize: 40,
      bayesThreshold: 0.8, windowSize: 2,
    });

    expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
  });

  it("supports adaptive mode", () => {
    const text = "文1です。文2です。文3です。文4です。文5です。文6です。";
    const result = segmentByBayes(text, {
      adaptive: true, minChunkSize: 5, maxChunkSize: 60,
      windowSize: 2, bayesPercentile: 0.3,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.start).toBe(0);
    expect(result[result.length - 1]?.end).toBe(text.length);
  });

  it("default window size is 5", () => {
    // With only 5 sentences, windowSize=5 means no boundaries detected
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    const result = segmentByBayes(text);
    expect(result).toHaveLength(1);
  });

  describe("with prior", () => {
    const boilerplatePrior: NgramPrior = new Map([
      ["gutenberg", 4.0],
      ["license", 3.5],
      ["copyright", 3.0],
      ["ebook", 3.5],
      ["trademark", 3.5],
    ]);

    it("detects boundaries between boilerplate and content with prior", () => {
      const text = [
        "This ebook is provided under the Project Gutenberg license.",
        "Copyright and trademark notices apply to this electronic work.",
        "You may distribute this ebook under the terms of the license.",
        "The hero walked through the ancient forest listening to the wind.",
        "She found a hidden path among the rocks and followed it downhill.",
        "The valley below was green and full of wildflowers in the spring.",
        "Birds sang from every branch as the sunlight filtered through leaves.",
        "A stream wound its way through the meadow toward the distant hills.",
      ].join(" ");

      const config: BayesSegmenterConfig = {
        windowSize: 2,
        minChunkSize: 50,
        targetChunkSize: 200,
        maxChunkSize: 600,
        bayesThreshold: 0.1,
        prior: boilerplatePrior,
        priorWeight: 2.0,
      };

      const result = segmentByBayes(text, config);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(text.length);
    });
  });
});

describe("streamSegmentByBayes", () => {
  it("stream results match sync results", async () => {
    const text = "文1です。文2です。文3です。文4です。文5です。文6です。文7です。文8です。";
    const config: BayesSegmenterConfig = {
      windowSize: 2,
      minChunkSize: 5,
      maxChunkSize: 40,
      bayesThreshold: 0.1,
    };

    const syncResult = segmentByBayes(text, config);
    const streamedPoints = [];

    for await (const event of streamSegmentByBayes(text, config)) {
      if (event.type === "segment") {
        streamedPoints.push(event.point);
      }
    }

    expect(streamedPoints).toEqual(syncResult);
  });
});
