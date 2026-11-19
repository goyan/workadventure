import { describe, expect, it } from "vitest";
import {
    DOWNPOUR_FALL_PX,
    downpourAlpha,
    downpourDropCount,
    downpourDrops,
    SPLASH_FROM,
} from "../../../../../src/front/Phaser/Game/Catastrophe/DownpourFall";

describe("downpourDrops", () => {
    const centre = { x: 1000, y: 500 };

    it("shows more drops under a wider downpour, within bounds", () => {
        expect(downpourDropCount(0)).toBe(0);
        expect(downpourDropCount(Number.NaN)).toBe(0);
        expect(downpourDropCount(16)).toBe(24);
        expect(downpourDropCount(96)).toBeGreaterThan(downpourDropCount(48));
        expect(downpourDropCount(5000)).toBe(420);
    });

    it("lands every drop inside the disc lying on the ground, always at the same place", () => {
        const first = downpourDrops(0, centre, 96);
        const later = downpourDrops(137, centre, 96);
        expect(first).toHaveLength(downpourDropCount(96));
        first.forEach((drop, index) => {
            const dx = drop.landX - centre.x;
            const dy = (drop.landY - centre.y) * 2;
            expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(96 + 1e-6);
            expect(later[index].landX).toBe(drop.landX);
            expect(later[index].landY).toBe(drop.landY);
        });
    });

    it("a falling drop is above where it lands, a splash is on the ground", () => {
        for (const drop of downpourDrops(250, centre, 64)) {
            expect(drop.fall).toBeGreaterThanOrEqual(0);
            expect(drop.fall).toBeLessThan(1);
            if (drop.fall >= SPLASH_FROM) {
                expect(drop.y).toBe(drop.landY);
            } else {
                expect(drop.y).toBeLessThan(drop.landY);
                expect(drop.landY - drop.y).toBeLessThanOrEqual(DOWNPOUR_FALL_PX);
            }
        }
    });

    it("stands still in reduced motion", () => {
        expect(downpourDrops(0, centre, 64, true)).toEqual(downpourDrops(900, centre, 64, true));
    });
});

describe("downpourAlpha", () => {
    it("comes in, holds, and fades as it ends", () => {
        expect(downpourAlpha(0, 1000, 1000)).toBe(0);
        expect(downpourAlpha(100, 900, 1000)).toBeCloseTo(0.5);
        expect(downpourAlpha(500, 800, 1000)).toBe(1);
        expect(downpourAlpha(5000, 100, 1000)).toBeCloseTo(0.3);
        expect(downpourAlpha(5000, 0, 1000)).toBe(0);
    });
});
