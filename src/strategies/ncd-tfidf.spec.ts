/**
 * @file Tests for NCD+TF-IDF combined segmenter
 */

import { segmentByNcdTfidf, streamSegmentByNcdTfidf, calculateWindowNcdTfidfDistances } from "./ncd-tfidf";
import { splitIntoSentences } from "../utils/sentence-splitter";

describe("calculateWindowNcdTfidfDistances", () => {
  it("returns aligned divergence values and boundaries", () => {
    const text = "天気の話です。今日は晴れです。買い物の話です。スーパーへ行きました。";
    const sentences = splitIntoSentences(text);

    const result = calculateWindowNcdTfidfDistances(sentences, 2, { ncdWeight: 0.5, tfidfWeight: 0.5 });

    expect(result.divergenceValues.length).toBe(result.windowEndPositions.length);
    expect(result.divergenceValues.length).toBeGreaterThan(0);
  });
});

describe("segmentByNcdTfidf", () => {
  it("returns empty array for empty text", () => {
    expect(segmentByNcdTfidf("")).toEqual([]);
  });

  it("returns single segment for short text", () => {
    const text = "短いテキストです。";
    const result = segmentByNcdTfidf(text, { minChunkSize: 100 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: text.length, type: "paragraph" });
  });

  it("covers full text with no gaps", () => {
    const text = `最初のトピックです。天気の話です。今日は晴れです。

次のトピックです。買い物の話です。スーパーに行きました。

最後のトピックです。仕事の話です。会議がありました。`;

    const result = segmentByNcdTfidf(text, {
      minChunkSize: 20,
      targetChunkSize: 50,
      maxChunkSize: 200,
      ncdTfidfThreshold: 0.25,
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

  it("higher threshold tends to produce fewer or equal splits", () => {
    const text = `天気の話です。今日は晴れです。明日も晴れです。
買い物の話です。スーパーに行きました。野菜を買いました。
仕事の話です。会議がありました。資料を作成しました。`;

    const lowThreshold = segmentByNcdTfidf(text, { minChunkSize: 10, targetChunkSize: 40, windowSize: 2, ncdTfidfThreshold: 0.2 });
    const highThreshold = segmentByNcdTfidf(text, { minChunkSize: 10, targetChunkSize: 40, windowSize: 2, ncdTfidfThreshold: 0.75 });

    expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
  });

  it("supports adaptive mode", () => {
    const text = "文1です。文2です。文3です。文4です。文5です。文6です。";
    const result = segmentByNcdTfidf(text, { adaptive: true, minChunkSize: 5, maxChunkSize: 60, windowSize: 2, ncdTfidfPercentile: 0.3 });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.start).toBe(0);
    expect(result[result.length - 1]?.end).toBe(text.length);
  });

  it("falls back to default weights when both are zero", () => {
    const text = "文1です。文2です。文3です。文4です。";
    const result = segmentByNcdTfidf(text, { minChunkSize: 5, targetChunkSize: 10, windowSize: 1, ncdWeight: 0, tfidfWeight: 0 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe("streamSegmentByNcdTfidf", () => {
  it("stream results match sync results", async () => {
    const text = "最初の文です。二番目の文です。三番目の文です。";
    const config = { minChunkSize: 5, targetChunkSize: 10, windowSize: 1 };

    const syncResult = segmentByNcdTfidf(text, config);

    const streamPoints: Array<{ start: number; end: number; type: string }> = [];
    for await (const event of streamSegmentByNcdTfidf(text, config)) {
      if (event.type === "done") {
        streamPoints.push(...event.points);
      }
    }

    expect(streamPoints).toEqual(syncResult);
  });
});
