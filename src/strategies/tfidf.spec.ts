/**
 * @file Tests for TF-IDF based segmenter
 */

import { segmentByTfidf, streamSegmentByTfidf } from "./tfidf";

describe("segmentByTfidf", () => {
  it("returns empty array for empty text", () => {
    expect(segmentByTfidf("")).toEqual([]);
  });

  it("returns single segment for short text", () => {
    const text = "短いテキストです。";
    const result = segmentByTfidf(text, { minChunkSize: 100 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ start: 0, end: text.length, type: "paragraph" });
  });

  it("covers entire text without gaps", () => {
    const text = `最初のトピックです。天気の話をします。今日は晴れです。

次のトピックです。買い物の話をします。スーパーに行きました。

最後のトピックです。仕事の話をします。会議がありました。`;

    const result = segmentByTfidf(text, {
      minChunkSize: 20,
      targetChunkSize: 50,
      maxChunkSize: 200,
      tfidfThreshold: 0.25,
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

    const lowThreshold = segmentByTfidf(text, { minChunkSize: 10, targetChunkSize: 40, tfidfThreshold: 0.2, windowSize: 2 });
    const highThreshold = segmentByTfidf(text, { minChunkSize: 10, targetChunkSize: 40, tfidfThreshold: 0.7, windowSize: 2 });

    expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
  });

  it("supports adaptive mode", () => {
    const text = "文1です。文2です。文3です。文4です。文5です。文6です。";
    const result = segmentByTfidf(text, { adaptive: true, minChunkSize: 5, maxChunkSize: 60, windowSize: 2, tfidfPercentile: 0.3 });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]?.start).toBe(0);
    expect(result[result.length - 1]?.end).toBe(text.length);
  });
});

describe("streamSegmentByTfidf", () => {
  it("stream results match sync results", async () => {
    const text = "最初の文です。二番目の文です。三番目の文です。";
    const config = { minChunkSize: 5, targetChunkSize: 10, windowSize: 1 };

    const syncResult = segmentByTfidf(text, config);

    const streamPoints: Array<{ start: number; end: number; type: string }> = [];
    for await (const event of streamSegmentByTfidf(text, config)) {
      if (event.type === "done") {
        streamPoints.push(...event.points);
      }
    }

    expect(streamPoints).toEqual(syncResult);
  });
});
