import { describe, expect, it } from "vitest";
import {
    FootprintTrail,
    type FootprintMark,
    type WalkerSample,
} from "../../../../../src/front/Phaser/Game/Christmas/FootprintTrail";

/** Feeds one sample per call, from `from` to `to` (x only) by `step` px, and collects the marks. */
function walk(
    trail: FootprintTrail,
    from: number,
    to: number,
    step: number,
    running = false,
    id = "a",
): FootprintMark[] {
    const marks: FootprintMark[] = [];
    for (let x = from; x <= to; x += step) marks.push(...trail.update([{ id, x, y: 0, running }]));
    return marks;
}

const outdoors = () => true;

describe("FootprintTrail", () => {
    it("first sample leaves nothing", () => {
        expect(new FootprintTrail(outdoors).update([{ id: "a", x: 0, y: 0, running: false }])).toEqual([]);
    });

    it("walking leaves a step every 16 px", () => {
        const marks = walk(new FootprintTrail(outdoors), 0, 64, 4);
        expect(marks).toHaveLength(4);
        expect(marks.map((mark) => (mark.kind === "step" ? [mark.x, mark.side, mark.angle] : mark))).toEqual([
            [16, 1, 0],
            [32, -1, 0],
            [48, 1, 0],
            [64, -1, 0],
        ]);
        expect(marks.map((mark) => (mark.kind === "step" ? mark.y : NaN))).toEqual([3, -3, 3, -3]);
    });

    it("running leaves trail segments", () => {
        const marks = walk(new FootprintTrail(outdoors), 0, 40, 4, true);
        expect(marks.every((mark) => mark.kind === "trail")).toBe(true);
        const segments = marks.map((mark) => (mark.kind === "trail" ? [mark.x1, mark.x2] : []));
        expect(segments[0][0]).toBe(0);
        expect(segments[segments.length - 1][1]).toBe(40);
        for (let i = 1; i < segments.length; i++) expect(segments[i][0]).toBe(segments[i - 1][1]);
    });

    it("no mark indoors", () => {
        const marks = walk(new FootprintTrail((x) => x <= 30), 0, 64, 4);
        expect(marks.map((mark) => (mark.kind === "step" ? mark.x : -1))).toEqual([16]);
    });

    it("no mark across a jump", () => {
        const trail = new FootprintTrail(outdoors);
        trail.update([{ id: "a", x: 0, y: 0, running: true }]);
        expect(trail.update([{ id: "a", x: 100, y: 0, running: true }])).toEqual([]);
        const marks = walk(trail, 104, 116, 4);
        expect(marks.map((mark) => (mark.kind === "step" ? mark.x : -1))).toEqual([116]);
    });

    it("forgets absent walkers", () => {
        const trail = new FootprintTrail(outdoors);
        const sample: WalkerSample = { id: "a", x: 0, y: 0, running: true };
        trail.update([sample]);
        trail.update([]);
        expect(trail.update([{ ...sample, x: 40 }])).toEqual([]);
    });

    it("no mark along an interpolated teleport", () => {
        const trail = new FootprintTrail(outdoors);
        const marks: FootprintMark[] = [];
        // A remote player's 600 px teleport arrives smoothed over 24 frames of 16.7 ms.
        for (let frame = 0; frame <= 24; frame++) {
            marks.push(...trail.update([{ id: "a", x: frame * 25, y: 0, running: false }], frame * 16.7));
        }
        expect(marks).toEqual([]);
    });

    it("still marks a real run with timestamps", () => {
        const trail = new FootprintTrail(outdoors);
        const marks: FootprintMark[] = [];
        // 450 px/s: 7.5 px per 16.7 ms frame.
        for (let frame = 0; frame <= 12; frame++) {
            marks.push(...trail.update([{ id: "a", x: frame * 7.5, y: 0, running: true }], frame * 16.7));
        }
        expect(marks.length).toBeGreaterThan(0);
    });
});
