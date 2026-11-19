import { describe, expect, it } from "vitest";
import {
    flashAllowed,
    meteorFrame,
    waveCircles,
    wetStretches,
} from "../../../../../src/front/Phaser/Game/Catastrophe/MeteorFall";

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

describe("flashAllowed", () => {
    it("allows the first flash", () => {
        expect(flashAllowed(1000, undefined, 334)).toBe(true);
    });

    it("refuses a flash sooner than the minimum interval after the previous one began", () => {
        expect(flashAllowed(1333, 1000, 334)).toBe(false);
        expect(flashAllowed(1334, 1000, 334)).toBe(true);
    });

    it("keeps flashes at least 334 ms apart over a burst of impacts", () => {
        let lastFlashAt: number | undefined;
        const allowed: number[] = [];
        for (const impactAt of [0, 100, 200, 334, 400, 700]) {
            if (flashAllowed(impactAt, lastFlashAt, 334)) {
                lastFlashAt = impactAt;
                allowed.push(impactAt);
            }
        }
        expect(allowed).toEqual([0, 334, 700]);
    });
});

describe("waveCircles", () => {
    // The crater is 8 cells of 16 px wide, the front moves one cell every 100 ms, as far as 64 cells.
    it("starts at the rim of the crater when the meteor lands", () => {
        const circles = waveCircles(0);
        expect(circles[0].radius).toBe(128);
        expect(circles[0].alpha).toBeCloseTo(0.7, 5);
    });

    it("moves on with the wave of the server, followed by two fainter circles", () => {
        const circles = waveCircles(1000);
        expect(circles.map((circle) => circle.radius)).toEqual([288, 264, 240]);
        expect(circles[1].alpha).toBeLessThan(circles[0].alpha);
        expect(circles[2].alpha).toBeLessThan(circles[1].alpha);
    });

    it("fades as it goes and is gone once the wave ended", () => {
        expect(waveCircles(4000)[0].alpha).toBeLessThan(waveCircles(1000)[0].alpha);
        expect(waveCircles(5599)).toHaveLength(3);
        expect(waveCircles(5600)).toEqual([]);
    });

    it("has nothing to show before the impact", () => {
        expect(waveCircles(-1)).toEqual([]);
    });
});

describe("wetStretches", () => {
    it("has nothing to draw on dry ground", () => {
        expect(wetStretches([false, false, false, false])).toEqual([]);
    });

    it("draws the whole circle on open water", () => {
        expect(wetStretches([true, true, true, true])).toEqual([{ from: 0, to: 4 }]);
    });

    it("draws only the stretches on water", () => {
        expect(wetStretches([false, true, true, false, true, false])).toEqual([
            { from: 1, to: 3 },
            { from: 4, to: 5 },
        ]);
    });

    it("joins the stretch that goes round the start of the circle", () => {
        expect(wetStretches([true, false, false, true])).toEqual([{ from: 3, to: 5 }]);
    });
});
