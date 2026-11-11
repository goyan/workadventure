import { describe, expect, it } from "vitest";
import {
    DANCE_FLOOR_COLOURS,
    DANCE_FLOOR_PATTERNS,
    DANCE_FLOOR_TILE_PX,
    danceFloorGrid,
    type FloorGrid,
} from "../../../../../src/front/Phaser/Game/Lamps/DanceFloorPatterns";

const ROOM: FloorGrid = { cols: 12, rows: 10 };
const LIT = 0.5;

function litShare(pattern: (typeof DANCE_FLOOR_PATTERNS)[number], grid: FloorGrid, phase: number): number {
    let lit = 0;
    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            if (pattern.at(col, row, grid, phase).level >= LIT) lit++;
        }
    }
    return lit / (grid.cols * grid.rows);
}

describe("danceFloorGrid", () => {
    it("has one tile per 32 px square of the object", () => {
        expect(DANCE_FLOOR_TILE_PX).toBe(32);
        expect(danceFloorGrid({ width: 384, height: 320 })).toEqual({ cols: 12, rows: 10 });
        expect(danceFloorGrid({ width: 128, height: 128 })).toEqual({ cols: 4, rows: 4 });
    });

    it("keeps whole tiles for a size that is not a multiple of 32, and at least one", () => {
        expect(danceFloorGrid({ width: 100, height: 50 })).toEqual({ cols: 3, rows: 2 });
        expect(danceFloorGrid({ width: 5, height: 0 })).toEqual({ cols: 1, rows: 1 });
    });
});

describe("dance floor patterns", () => {
    it("offers the patterns of the brief: waves, checker, spiral, ripples from the centre, rain, sweeps, groups", () => {
        expect(DANCE_FLOOR_PATTERNS.map((pattern) => pattern.name)).toEqual(
            expect.arrayContaining(["waves", "checker", "spiral", "ripples", "rain", "sweep", "groups"]),
        );
    });

    it("lights its tiles in cyan, violet or magenta only", () => {
        expect(DANCE_FLOOR_COLOURS).toHaveLength(3);
        for (const pattern of DANCE_FLOOR_PATTERNS) {
            for (let phase = 0; phase < 40; phase += 0.5) {
                for (let row = 0; row < ROOM.rows; row++) {
                    for (let col = 0; col < ROOM.cols; col++) {
                        const tile = pattern.at(col, row, ROOM, phase);
                        expect(tile.level).toBeGreaterThanOrEqual(0);
                        expect(tile.level).toBeLessThanOrEqual(1);
                        expect([0, 1, 2]).toContain(tile.colour);
                    }
                }
            }
        }
    });

    it("always lights a part of the floor: never nothing, never everything", () => {
        for (const pattern of DANCE_FLOOR_PATTERNS) {
            for (const grid of [ROOM, { cols: 4, rows: 4 }, { cols: 30, rows: 20 }]) {
                for (let phase = 0; phase < 64; phase += 0.5) {
                    const share = litShare(pattern, grid, phase);
                    expect(share, `${pattern.name} at ${phase} on ${grid.cols}x${grid.rows}`).toBeGreaterThan(0);
                    expect(share, `${pattern.name} at ${phase} on ${grid.cols}x${grid.rows}`).toBeLessThan(1);
                }
            }
        }
    });

    it("moves: the lit tiles change as the phase goes on", () => {
        for (const pattern of DANCE_FLOOR_PATTERNS) {
            const picture = (phase: number): string => {
                let cells = "";
                for (let row = 0; row < ROOM.rows; row++) {
                    for (let col = 0; col < ROOM.cols; col++) {
                        cells += pattern.at(col, row, ROOM, phase).level >= LIT ? "1" : "0";
                    }
                }
                return cells;
            };
            const pictures = new Set(Array.from({ length: 16 }, (_, step) => picture(step)));
            expect(pictures.size, pattern.name).toBeGreaterThan(1);
        }
    });

    it("gives the same floor for the same phase: every player sees the same pattern", () => {
        for (const pattern of DANCE_FLOOR_PATTERNS) {
            expect(pattern.at(3, 4, ROOM, 7.25)).toEqual(pattern.at(3, 4, ROOM, 7.25));
        }
    });
});
