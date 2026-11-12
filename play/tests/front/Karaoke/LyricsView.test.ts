import { describe, expect, it } from "vitest";
import { centeredScrollTop, lyricLineProgress } from "../../../src/front/Karaoke/LyricsView";

const lines = [
    { atMs: 1000, text: "First" },
    { atMs: 3000, text: "Second" },
    { atMs: 3000, text: "Second, repeated timestamp" },
    { atMs: 7000, text: "Last" },
];

describe("lyricLineProgress", () => {
    it("goes linearly from the line's start to the start of the next line", () => {
        expect(lyricLineProgress(lines, 0, 1000)).toBe(0);
        expect(lyricLineProgress(lines, 0, 1500)).toBe(0.25);
        expect(lyricLineProgress(lines, 0, 2000)).toBe(0.5);
        expect(lyricLineProgress(lines, 0, 3000)).toBe(1);
    });

    it("stays within the line whatever the position", () => {
        expect(lyricLineProgress(lines, 0, 0)).toBe(0);
        expect(lyricLineProgress(lines, 0, 60_000)).toBe(1);
    });

    it("ends a line at the next later timestamp when several lines share its own", () => {
        expect(lyricLineProgress(lines, 1, 5000)).toBe(0.5);
        expect(lyricLineProgress(lines, 2, 5000)).toBe(0.5);
    });

    it("ends the last line with the track when its duration is known", () => {
        expect(lyricLineProgress(lines, 3, 8000, 9000)).toBe(0.5);
    });

    it("has no progress without a known end, nor outside the lyrics", () => {
        expect(lyricLineProgress(lines, 3, 8000)).toBeUndefined();
        expect(lyricLineProgress(lines, 3, 8000, 7000)).toBeUndefined();
        expect(lyricLineProgress(lines, -1, 500)).toBeUndefined();
        expect(lyricLineProgress(lines, 4, 500)).toBeUndefined();
        expect(lyricLineProgress([], 0, 500)).toBeUndefined();
    });
});

describe("centeredScrollTop", () => {
    it("puts the middle of the line in the middle of the view", () => {
        expect(centeredScrollTop(500, 40, 300)).toBe(370);
    });

    it("never scrolls above the first lines", () => {
        expect(centeredScrollTop(50, 40, 300)).toBe(0);
    });
});
