import { describe, expect, it } from "vitest";
import { meteorFrame } from "../../../../../src/front/Phaser/Game/Catastrophe/MeteorFall";

const FALL_MS = 1200;

describe("meteorFrame", () => {
    it("starts small and far, with no flash and no burst", () => {
        const frame = meteorFrame(0, FALL_MS, false);

        expect(frame.shadowScale).toBeCloseTo(0.2);
        expect(frame.offset.x).toBeCloseTo(-240);
        expect(frame.offset.y).toBeCloseTo(-480);
        expect(frame.flash).toBe(0);
        expect(frame.burst).toBeUndefined();
        expect(frame.done).toBe(false);
    });

    it("lands at the impact point, flashing, with the burst just starting", () => {
        const frame = meteorFrame(FALL_MS, FALL_MS, false);

        expect(frame.shadowScale).toBeCloseTo(1);
        expect(frame.offset.x).toBeCloseTo(0);
        expect(frame.offset.y).toBeCloseTo(0);
        expect(frame.flash).toBeCloseTo(1);
        expect(frame.burst).toBeCloseTo(0);
        expect(frame.done).toBe(false);
    });

    it("moves linearly in time during the fall", () => {
        const frame = meteorFrame(FALL_MS / 2, FALL_MS, false);

        expect(frame.shadowScale).toBeCloseTo(0.6);
        expect(frame.offset.x).toBeCloseTo(-120);
        expect(frame.offset.y).toBeCloseTo(-240);
    });

    it("clamps before the launch", () => {
        const frame = meteorFrame(-500, FALL_MS, false);

        expect(frame.shadowScale).toBeCloseTo(0.2);
        expect(frame.offset.y).toBeCloseTo(-480);
        expect(frame.burst).toBeUndefined();
    });

    it("has no flash 120 ms after the impact, and a burst half way at 300 ms", () => {
        expect(meteorFrame(FALL_MS + 120, FALL_MS, false).flash).toBeCloseTo(0);
        expect(meteorFrame(FALL_MS + 300, FALL_MS, false).burst).toBeCloseTo(0.5);
    });

    it("is done 600 ms after the impact, not before", () => {
        expect(meteorFrame(FALL_MS + 599, FALL_MS, false).done).toBe(false);
        expect(meteorFrame(FALL_MS + 600, FALL_MS, false).done).toBe(true);
    });

    it("keeps only the shadow and the burst for who asked for less motion", () => {
        for (const elapsed of [0, 600, FALL_MS, FALL_MS + 60, FALL_MS + 300]) {
            const frame = meteorFrame(elapsed, FALL_MS, true);
            expect(frame.flash).toBe(0);
            expect(frame.offset).toEqual({ x: 0, y: 0 });
        }
        expect(meteorFrame(FALL_MS + 300, FALL_MS, true).burst).toBeCloseTo(0.5);
    });
});
