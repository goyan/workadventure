import { describe, expect, it } from "vitest";
import { hashedCell, instanceStarts } from "../../../../../src/front/Phaser/Game/Weather/PrecipitationLayer";
import { fallHash } from "../../../../../src/front/Phaser/Game/Weather/FallHash";
import { rainPlanes } from "../../../../../src/front/Phaser/Game/Weather/Rain";

const view = { x: 0, y: 0, width: 960, height: 720 };

describe("instanceStarts", () => {
    it("puts the groups one after the other, every copy of every cell once, the slots left past the last", () => {
        const groups = [
            { firstColumn: -3, firstRow: 4, columns: 10, rows: 5, copies: 2 },
            { firstColumn: 0, firstRow: 0, columns: 3, rows: 3, copies: 7 },
        ];
        const { starts, count } = instanceStarts(groups, 3);
        expect(starts.slice(0, 2)).toEqual([0, 100]);
        expect(count).toBe(100 + 63);
        expect(starts[2]).toBeGreaterThan(count);
    });

    it("reads the instances of the planes of a ×32 rain: far under the 16 million a float counts exactly", () => {
        const planes = rainPlanes(view, 1, { x: 0, y: 0 }, true, 160);
        const { count } = instanceStarts(planes, 3);
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(2 ** 24);
    });
});

describe("hashedCell", () => {
    it("gives the hash the same column as the whole number, however far the air carried the cells", () => {
        for (const column of [-2.5e10, -1, 0, 4095, 4096, 7.3e9]) {
            const wrapped = hashedCell(column);
            expect(wrapped).toBeGreaterThanOrEqual(0);
            expect(wrapped).toBeLessThan(4096);
            expect(fallHash(wrapped + 17, 3, 5)).toBe(fallHash(column + 17, 3, 5));
        }
    });
});
