/**
 * @file Tests for compression-based segmenter
 */

import { segmentByCompression, streamSegmentByCompression } from "./compression";
import {
  RASHOMON_EXCERPT_FIXTURE,
  JAPANESE_ARTICLE_FIXTURE,
  MULTI_PARAGRAPH_FIXTURE,
  SINGLE_PARAGRAPH_FIXTURE,
} from "../../spec/fixtures/texts";

describe("segmentByCompression", () => {
  describe("basic behavior", () => {
    it("returns empty array for empty text", () => {
      expect(segmentByCompression("")).toHaveLength(0);
    });

    it("returns empty array for whitespace-only text", () => {
      expect(segmentByCompression("   \n\t  ")).toHaveLength(0);
    });

    it("returns single segment for short text", () => {
      const result = segmentByCompression("短いテキストです。", { minChunkSize: 50 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: 9, type: "paragraph" });
    });

    it("covers entire text with no gaps", () => {
      const text = "これは最初の文です。これは二番目の文です。そしてこれは三番目の文です。";
      const result = segmentByCompression(text, { minChunkSize: 10, targetChunkSize: 20 });

      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(text.length);

      for (const [i, seg] of result.entries()) {
        const prev = result[i - 1];
        if (prev) {
          expect(seg.start).toBe(prev.end);
        }
      }
    });

    it("respects maxChunkSize constraint", () => {
      const longText = "これは長いテキストです。".repeat(50);
      const result = segmentByCompression(longText, { maxChunkSize: 100, minChunkSize: 20, targetChunkSize: 50 });

      for (const segment of result) {
        expect(segment.end - segment.start).toBeLessThanOrEqual(100 * 1.5);
      }
    });

    it("all segments have type paragraph", () => {
      const text = "最初の段落です。二番目の段落です。三番目の段落です。";
      const result = segmentByCompression(text, { minChunkSize: 5, targetChunkSize: 10 });

      for (const segment of result) {
        expect(segment.type).toBe("paragraph");
      }
    });
  });

  describe("with short fixtures", () => {
    it("segments RASHOMON_EXCERPT into multiple parts", () => {
      const result = segmentByCompression(RASHOMON_EXCERPT_FIXTURE.input, { targetChunkSize: 50, minChunkSize: 20 });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(RASHOMON_EXCERPT_FIXTURE.input.length);
    });

    it("segments JAPANESE_ARTICLE into sections", () => {
      const result = segmentByCompression(JAPANESE_ARTICLE_FIXTURE.input, {
        targetChunkSize: 30,
        minChunkSize: 10,
        ncdThreshold: 0.3,
      });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(JAPANESE_ARTICLE_FIXTURE.input.length);
    });

    it("segments MULTI_PARAGRAPH appropriately", () => {
      const result = segmentByCompression(MULTI_PARAGRAPH_FIXTURE.input, {
        targetChunkSize: 100,
        minChunkSize: 50,
        ncdThreshold: 0.35,
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(MULTI_PARAGRAPH_FIXTURE.input.length);
    });

    it("keeps SINGLE_PARAGRAPH as one segment when under target size", () => {
      const result = segmentByCompression(SINGLE_PARAGRAPH_FIXTURE.input, {
        targetChunkSize: 500,
        minChunkSize: 100,
        maxChunkSize: 2000,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: 0, end: SINGLE_PARAGRAPH_FIXTURE.input.length, type: "paragraph" });
    });
  });

  describe("configuration options", () => {
    it("higher ncdThreshold produces fewer splits", () => {
      const text = `最初のトピック。天気の話です。今日は晴れています。

別のトピック。買い物の話です。スーパーに行きました。

さらに別のトピック。仕事の話です。会議がありました。`;

      const lowThreshold = segmentByCompression(text, { ncdThreshold: 0.2, minChunkSize: 10, targetChunkSize: 30 });
      const highThreshold = segmentByCompression(text, { ncdThreshold: 0.6, minChunkSize: 10, targetChunkSize: 30 });

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it("smaller targetChunkSize produces more splits", () => {
      const text = "文1です。文2です。文3です。文4です。文5です。文6です。";

      const largeTarget = segmentByCompression(text, { targetChunkSize: 100, minChunkSize: 5, maxChunkSize: 200 });
      const smallTarget = segmentByCompression(text, { targetChunkSize: 15, minChunkSize: 5, maxChunkSize: 50 });

      expect(smallTarget.length).toBeGreaterThanOrEqual(largeTarget.length);
    });
  });

  describe("edge cases", () => {
    it("handles text without sentence terminators", () => {
      const text = "この文には句読点がありません";
      const result = segmentByCompression(text, { minChunkSize: 10 });
      expect(result).toHaveLength(1);
      expect(result[0]?.end).toBe(text.length);
    });

    it("handles mixed Japanese and English", () => {
      const text = "日本語の文です。This is English. また日本語。More English here.";
      const result = segmentByCompression(text, { minChunkSize: 10, targetChunkSize: 20 });

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(text.length);
    });

    it("handles very long repetitive text", () => {
      const text = "同じ文です。".repeat(100);
      const result = segmentByCompression(text, { maxChunkSize: 200, minChunkSize: 50, targetChunkSize: 100 });

      expect(result.length).toBeGreaterThan(1);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(text.length);
    });
  });

  describe("adaptive mode", () => {
    it("segments text based on NCD peaks", () => {
      const text = `最初のトピック。天気の話です。今日は晴れています。明日も晴れでしょう。

全く別のトピック。買い物の話です。スーパーに行きました。野菜を買いました。

さらに別のトピック。仕事の話です。会議がありました。新しいプロジェクトが始まりました。`;

      const result = segmentByCompression(text, { adaptive: true, minChunkSize: 20, maxChunkSize: 500, windowSize: 2 });

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]?.start).toBe(0);
      expect(result[result.length - 1]?.end).toBe(text.length);
    });

    it("respects maxChunkSize in adaptive mode", () => {
      const text = "これは長いテキストです。".repeat(50);
      const maxSize = 150;

      const result = segmentByCompression(text, { adaptive: true, minChunkSize: 20, maxChunkSize: maxSize, windowSize: 2 });

      for (const segment of result) {
        expect(segment.end - segment.start).toBeLessThanOrEqual(maxSize * 1.5);
      }
    });
  });
});

describe("streamSegmentByCompression", () => {
  it("stream results match sync results", async () => {
    const text = "最初の段落です。二番目の段落です。三番目の段落です。";
    const config = { minChunkSize: 10, targetChunkSize: 15 };

    const syncResult = segmentByCompression(text, config);

    const streamPoints: Array<{ start: number; end: number; type: string }> = [];
    for await (const event of streamSegmentByCompression(text, config)) {
      if (event.type === "done") {
        streamPoints.push(...event.points);
      }
    }

    expect(streamPoints).toEqual(syncResult);
  });
});
