import { describe, expect, it } from "vitest";
import {
    SMOULDER_TILE_MS,
    SmoulderingGround,
    STEAM_MS,
    smoulderPoints,
} from "../../../../../src/front/Phaser/Game/Fire/Smoulder";

const view = { fromX: 0, toX: 20, fromY: 0, toY: 20 };
const dry = (): boolean => false;
const wet = (): boolean => true;

describe("SmoulderingGround", () => {
    it("lets a tile smoke and glow for a while once its fire is out", () => {
        const ground = new SmoulderingGround();
        expect(SMOULDER_TILE_MS).toBe(45_000);
        ground.see([{ x: 3, y: 4 }], view, 0, dry);
        expect(ground.tiles(0)).toEqual([]);
        // Its fire is out at the next look.
        ground.see([], view, 1000, dry);
        expect(ground.tiles(1000)).toEqual([{ x: 3, y: 4, left: 1, steam: false }]);
        expect(ground.tiles(1000 + 22_500)).toEqual([{ x: 3, y: 4, left: 0.5, steam: false }]);
        expect(ground.tiles(1000 + 45_000)).toEqual([]);
        expect(ground.active(1000 + 45_000)).toBe(false);
    });

    it("gives steam instead, for a shorter while, when water put the fire out", () => {
        const ground = new SmoulderingGround();
        expect(STEAM_MS).toBe(12_000);
        ground.see([{ x: 3, y: 4 }], view, 0, wet);
        ground.see([], view, 1000, (x, y) => x === 3 && y === 4);
        expect(ground.tiles(1000)).toEqual([{ x: 3, y: 4, left: 1, steam: true }]);
        expect(ground.tiles(1000 + 6000)).toEqual([{ x: 3, y: 4, left: 0.5, steam: true }]);
        expect(ground.tiles(1000 + 12_000)).toEqual([]);
    });

    it("does not take a tile that left the view for one whose fire went out", () => {
        const ground = new SmoulderingGround();
        ground.see([{ x: 3, y: 4 }], view, 0, dry);
        // The view moved away: the tile is not looked at any more.
        ground.see([], { fromX: 10, toX: 30, fromY: 0, toY: 20 }, 1000, dry);
        expect(ground.tiles(1000)).toEqual([]);
    });

    it("stops smouldering when the tile burns again, and forgets everything when cleared", () => {
        const ground = new SmoulderingGround();
        ground.see([{ x: 3, y: 4 }], view, 0, dry);
        ground.see([], view, 1000, dry);
        ground.see([{ x: 3, y: 4 }], view, 2000, dry);
        expect(ground.tiles(2000)).toEqual([]);
        ground.see([], view, 3000, dry);
        expect(ground.active(3000)).toBe(true);
        ground.clear();
        expect(ground.active(3000)).toBe(false);
    });
});

describe("smoulderPoints", () => {
    it("scatters a few embers over a tile, always the same for a tile, that die one after another", () => {
        const fresh = smoulderPoints(3, 4, 1);
        expect(fresh).toHaveLength(3);
        expect(smoulderPoints(3, 4, 1)).toEqual(fresh);
        for (const point of fresh) {
            // Inside the tile, in map pixels.
            expect(point.x).toBeGreaterThanOrEqual(3 * 32);
            expect(point.x).toBeLessThan(4 * 32);
            expect(point.y).toBeGreaterThanOrEqual(4 * 32);
            expect(point.y).toBeLessThan(5 * 32);
            expect(point.alpha).toBeGreaterThan(0);
            expect(point.alpha).toBeLessThanOrEqual(1);
        }
        expect(smoulderPoints(5, 4, 1)).not.toEqual(fresh);
        expect(smoulderPoints(3, 4, 0.5).length).toBeLessThan(3);
        expect(smoulderPoints(3, 4, 0.5).length).toBeGreaterThan(0);
        expect(smoulderPoints(3, 4, 0)).toEqual([]);
    });
});
