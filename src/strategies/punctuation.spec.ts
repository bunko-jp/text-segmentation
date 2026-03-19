/**
 * @file Tests for punctuation-based chunker
 */

import { segmentByPunctuation, streamSegmentByPunctuation } from "./punctuation";
import type { SegmentPointStreamEvent } from "../utils/semantic-window-segmentation";

describe("segmentByPunctuation", () => {
  describe("basic segmentation", () => {
    it("returns empty array for empty text", () => {
      expect(segmentByPunctuation("")).toHaveLength(0);
    });

    it("returns empty array for whitespace-only text", () => {
      expect(segmentByPunctuation("   \n\n   ")).toHaveLength(0);
    });

    it("returns single segment for short text", () => {
      const text = "短いテキスト。";
      const points = segmentByPunctuation(text, { minChunkSize: 50 });
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ start: 0, end: text.length, type: "paragraph" });
    });

    it("splits at sentence boundaries to reach target size", () => {
      const text = "これは最初の文です。これは二番目の文です。これは三番目の文です。";
      const points = segmentByPunctuation(text, { targetChunkSize: 15, minChunkSize: 5 });

      expect(points.length).toBeGreaterThan(1);
      for (const [i, curr] of points.entries()) {
        const prev = points[i - 1];
        if (prev) {
          expect(curr.start).toBe(prev.end);
        }
      }
    });
  });

  describe("Japanese text", () => {
    it("handles Japanese punctuation correctly", () => {
      const text = "最初の文。二番目の文！三番目の文？";
      const points = segmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 5 });

      expect(points.length).toBeGreaterThanOrEqual(1);
      for (const point of points) {
        expect(point.type).toBe("paragraph");
      }
    });

    it("handles closing brackets after punctuation", () => {
      const text = "「こんにちは。」「さようなら。」";
      const points = segmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 5 });
      expect(points.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("English text", () => {
    it("handles English punctuation correctly", () => {
      const text = "First sentence. Second sentence! Third sentence?";
      const points = segmentByPunctuation(text, { targetChunkSize: 20, minChunkSize: 10 });
      expect(points.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("chunk size constraints", () => {
    it("respects target chunk size", () => {
      const longText = "これは長い文です。".repeat(20);
      const targetSize = 100;
      const points = segmentByPunctuation(longText, { targetChunkSize: targetSize, minChunkSize: 10 });

      for (const point of points.slice(0, -1)) {
        const chunkSize = point.end - point.start;
        expect(chunkSize).toBeGreaterThanOrEqual(targetSize * 0.5);
      }
    });

    it("forces split at max chunk size", () => {
      const text = "a".repeat(3000);
      const maxSize = 500;
      const points = segmentByPunctuation(text, { targetChunkSize: 100, minChunkSize: 10, maxChunkSize: maxSize });

      for (const point of points.slice(0, -1)) {
        const chunkSize = point.end - point.start;
        expect(chunkSize).toBeLessThanOrEqual(maxSize);
      }
    });

    it("merges small trailing chunks with previous", () => {
      const text = "長い文章です。短。";
      const points = segmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 5 });

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        expect(lastPoint?.end).toBe(text.length);
      }
    });
  });

  describe("position tracking", () => {
    it("returns correct positions and text can be reconstructed", () => {
      const text = "最初の文。二番目の文。三番目の文。";
      const points = segmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 3 });

      for (const point of points) {
        expect(point.start).toBeGreaterThanOrEqual(0);
        expect(point.end).toBeLessThanOrEqual(text.length);
        expect(point.end).toBeGreaterThan(point.start);
      }

      const reconstructed = points.map((p) => text.slice(p.start, p.end)).join("");
      expect(reconstructed).toBe(text);
    });

    it("segments are contiguous", () => {
      const text = "文1。文2。文3。文4。文5。";
      const points = segmentByPunctuation(text, { targetChunkSize: 6, minChunkSize: 3 });

      for (const [i, curr] of points.entries()) {
        const prev = points[i - 1];
        if (prev) {
          expect(curr.start).toBe(prev.end);
        }
      }
    });
  });
});

describe("streamSegmentByPunctuation", () => {
  async function collectEvents(generator: AsyncGenerator<SegmentPointStreamEvent>): Promise<SegmentPointStreamEvent[]> {
    const events: SegmentPointStreamEvent[] = [];
    for await (const event of generator) {
      events.push(event);
    }
    return events;
  }

  it("yields done event for empty text", async () => {
    const events = await collectEvents(streamSegmentByPunctuation(""));
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("done");
  });

  it("yields segment events followed by done", async () => {
    const text = "最初の文。二番目の文。三番目の文。";
    const events = await collectEvents(streamSegmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 3 }));

    const segmentEvents = events.filter((e) => e.type === "segment");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(segmentEvents.length).toBeGreaterThanOrEqual(1);
    expect(doneEvents).toHaveLength(1);
    expect(events[events.length - 1]?.type).toBe("done");
  });

  it("done event contains all points", async () => {
    const text = "最初の文。二番目の文。";
    const events = await collectEvents(streamSegmentByPunctuation(text, { targetChunkSize: 10, minChunkSize: 3 }));

    const doneEvent = events.find((e) => e.type === "done");
    const segmentEvents = events.filter((e) => e.type === "segment");

    if (doneEvent?.type === "done") {
      expect(doneEvent.points).toHaveLength(segmentEvents.length);
    }
  });
});
