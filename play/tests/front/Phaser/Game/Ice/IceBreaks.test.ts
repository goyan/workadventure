import { describe, expect, it } from "vitest";
import { CRACK_MS, HOLE_OPEN_MS, HOLE_RADIUS_PX, IceBreaks } from "../../../../../src/front/Phaser/Game/Ice/IceBreaks";

describe("IceBreaks", () => {
    it("cracks under an avatar on thin ice, then breaks a hole where they stand", () => {
        const breaks = new IceBreaks();
        expect(breaks.step(0, { x: 100, y: 100 }, true)).toBeUndefined();
        expect(breaks.shown(CRACK_MS / 2)[0].phase).toBeCloseTo(0.5);
        expect(breaks.step(CRACK_MS / 2, { x: 104, y: 100 }, true)).toBeUndefined();
        expect(breaks.step(CRACK_MS, { x: 104, y: 100 }, true)).toEqual({ x: 100, y: 100 });
        expect(breaks.holeAt(100, 100, CRACK_MS + 1)).toBe(true);
        expect(breaks.shown(CRACK_MS + 1)[0].phase).toBeGreaterThanOrEqual(1);
    });

    it("never breaks ice that bears the avatar, and starts again when they walk on", () => {
        const breaks = new IceBreaks();
        breaks.step(0, { x: 100, y: 100 }, false);
        expect(breaks.step(CRACK_MS * 2, { x: 100, y: 100 }, false)).toBeUndefined();
        breaks.step(0, { x: 100, y: 100 }, true);
        expect(breaks.step(CRACK_MS, { x: 100 + HOLE_RADIUS_PX * 2, y: 100 }, true)).toBeUndefined();
        expect(breaks.holeAt(100, 100, CRACK_MS)).toBe(false);
    });

    it("lets a hole freeze over, and keeps one hole where the room tells one already open", () => {
        const breaks = new IceBreaks();
        breaks.addHole(200, 200, 0);
        breaks.addHole(205, 200, 10);
        expect(breaks.shown(10)).toHaveLength(1);
        expect(breaks.holeIn({ x: 180, y: 190, width: 10, height: 10 }, 10)).toBe(true);
        expect(breaks.holeAt(200, 200, HOLE_OPEN_MS)).toBe(false);
        breaks.step(HOLE_OPEN_MS, undefined, false);
        expect(breaks.active()).toBe(false);
    });
});
