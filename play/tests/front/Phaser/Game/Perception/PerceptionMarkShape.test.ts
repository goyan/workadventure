import { describe, expect, it } from "vitest";
import {
    perceptionMarkLift,
    perceptionMarkPixels,
    perceptionMarkSize,
} from "../../../../../src/front/Phaser/Game/Perception/PerceptionMarkShape";
import { NERF_HEART_HEIGHT } from "../../../../../src/front/Phaser/Game/Nerf/NerfHeartShape";

describe("PerceptionMarkShape", () => {
    it("draws three small symbols, readable at 12 to 16 pixels", () => {
        for (const mark of ["basic", "place", "water"] as const) {
            const { width, height } = perceptionMarkSize(mark);
            expect(Math.max(width, height)).toBeGreaterThanOrEqual(10);
            expect(Math.max(width, height)).toBeLessThanOrEqual(16);
            expect(perceptionMarkPixels(mark).some((pixel) => pixel.sparkle)).toBe(true);
        }
    });

    it("tells the two symbols apart by their shape, not only by their colors", () => {
        const body = (mark: "basic" | "place"): Set<string> =>
            new Set(
                perceptionMarkPixels(mark)
                    .filter((pixel) => !pixel.sparkle)
                    .map((pixel) => `${pixel.x},${pixel.y}`),
            );
        const basic = body("basic");
        const place = body("place");
        // Basique: an eye crossed out from one corner to the other; the ball of the other place has no such stroke.
        for (const corner of ["0,0", "11,11"]) {
            expect(basic.has(corner)).toBe(true);
            expect(place.has(corner)).toBe(false);
        }
        // The ball is round, the eye flat.
        const rows = (pixels: Set<string>, column: number): number =>
            [...pixels].filter((key) => key.startsWith(`${column},`)).length;
        expect(rows(place, 4)).toBeGreaterThanOrEqual(10);
        expect(rows(basic, 6)).toBeLessThanOrEqual(7);
    });

    it("draws fast water as a drop: pointed at its top, round at its foot, unlike the ball and the eye", () => {
        const body = new Set(
            perceptionMarkPixels("water")
                .filter((pixel) => !pixel.sparkle)
                .map((pixel) => `${pixel.x},${pixel.y}`),
        );
        const width = (row: number): number => [...body].filter((key) => key.endsWith(`,${row}`)).length;
        const rows = [...body].map((key) => Number(key.split(",")[1]));
        const top = Math.min(...rows);
        const bottom = Math.max(...rows);
        expect(width(top)).toBe(1);
        expect(
            Math.max(...Array.from({ length: bottom - top + 1 }, (_, at) => width(top + at))),
        ).toBeGreaterThanOrEqual(7);
        for (const corner of ["0,0", "11,11"]) expect(body.has(corner)).toBe(false);
    });

    it("floats over the name tag, higher when the Nerf hearts sit on it", () => {
        expect(perceptionMarkLift(false)).toBeGreaterThan(0);
        expect(perceptionMarkLift(true)).toBeGreaterThan(perceptionMarkLift(false) + NERF_HEART_HEIGHT);
    });
});
