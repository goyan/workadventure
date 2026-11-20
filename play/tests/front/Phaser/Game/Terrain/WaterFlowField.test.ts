import { describe, expect, it } from "vitest";
import { CELL_AREA_M2, CELL_LITRES_PER_PX, cellKey, withHeights } from "@workadventure/map-editor";
import {
    flowAtCell,
    flowOverBlock,
    flowSpeedColor,
    FLOW_SPEED_SCALE,
} from "../../../../../src/front/Phaser/Game/Terrain/WaterFlowField";
import { waterMassesOf } from "../../../../../src/front/Phaser/Game/Terrain/WaterMasses";
import type { SettledWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";

/** A state of the water over a grid of `width` by `height` cells from the cell 0,0. */
function state(
    width: number,
    height: number,
    depthOf: (x: number, y: number) => number,
    beforeOf: (x: number, y: number) => number = depthOf,
    seconds = 1,
): SettledWater {
    const depths = new Float32Array(width * height);
    const before = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            depths[y * width + x] = depthOf(x, y);
            before[y * width + x] = beforeOf(x, y);
        }
    }
    return { x: 0, y: 0, width, height, depths, before, seconds };
}

describe("flowAtCell", () => {
    it("runs down the slope of the surface, faster on a steeper one", () => {
        // The water gets shallower towards the east on level ground: it runs east.
        const gentle = flowAtCell(
            state(20, 5, (x) => 20 - x * 0.2),
            undefined,
            10,
            2,
            true,
        );
        expect(gentle.x).toBeCloseTo(1, 5);
        expect(gentle.y).toBeCloseTo(0, 5);
        expect(gentle.speed).toBeGreaterThan(0);
        const steep = flowAtCell(
            state(20, 5, (x) => 20 - x * 0.6),
            undefined,
            10,
            2,
            true,
        );
        expect(steep.speed).toBeGreaterThan(gentle.speed);
        // And south when it gets shallower towards the south.
        const south = flowAtCell(
            state(5, 20, (_x, y) => 20 - y * 0.2),
            undefined,
            2,
            10,
            true,
        );
        expect(south.y).toBeCloseTo(1, 5);
    });

    it("is still in a level lake, under a film and on dry ground", () => {
        expect(
            flowAtCell(
                state(9, 9, () => 12),
                undefined,
                4,
                4,
                true,
            ).speed,
        ).toBe(0);
        expect(
            flowAtCell(
                state(9, 9, () => 0.2),
                undefined,
                4,
                4,
                true,
            ).depth,
        ).toBe(0);
        expect(
            flowAtCell(
                state(9, 9, () => 0),
                undefined,
                4,
                4,
                true,
            ).speed,
        ).toBe(0);
    });

    it("takes a dry bank for a shore, and a dry hollow for a drop", () => {
        // Water in a basin dug 20 px deep, dry ground at its level all around: no flow towards the bank.
        const dug = new Map<string, number>();
        for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) dug.set(cellKey(x, y), -20);
        const basin = withHeights(undefined, dug);
        const atBank = flowAtCell(
            state(9, 9, (x) => (x < 5 ? 10 : 0)),
            basin,
            4,
            4,
            true,
        );
        expect(atBank.speed).toBe(0);
        // Water on level ground next to a dry hollow: it runs into it.
        const hollow = new Map<string, number>();
        for (let y = 0; y < 9; y++) for (let x = 5; x < 9; x++) hollow.set(cellKey(x, y), -20);
        const atDrop = flowAtCell(
            state(9, 9, (x) => (x < 5 ? 10 : 0)),
            withHeights(undefined, hollow),
            4,
            4,
            true,
        );
        expect(atDrop.x).toBeCloseTo(1, 5);
        expect(atDrop.speed).toBeGreaterThan(0);
    });

    it("tells how fast the level rises or falls", () => {
        const rising = flowAtCell(
            state(
                9,
                9,
                () => 12,
                () => 10,
                2,
            ),
            undefined,
            4,
            4,
            true,
        );
        expect(rising.rate).toBeCloseTo(1, 5);
        const single = flowAtCell(
            state(
                9,
                9,
                () => 12,
                () => 10,
                Infinity,
            ),
            undefined,
            4,
            4,
            true,
        );
        expect(single.rate).toBe(0);
    });

    it("runs slower without inertia in deep water, for the same slope", () => {
        const water = state(20, 5, (x) => 60 - x * 0.2);
        expect(flowAtCell(water, undefined, 10, 2, false).speed).toBeLessThan(
            flowAtCell(water, undefined, 10, 2, true).speed,
        );
    });
});

describe("flowOverBlock", () => {
    it("is the flow of the cell for a block of one, and a mean over a larger one", () => {
        const water = state(40, 40, (x) => 30 - x * 0.2);
        expect(flowOverBlock(water, undefined, 10, 10, 1, true)).toEqual(flowAtCell(water, undefined, 10, 10, true));
        const block = flowOverBlock(water, undefined, 8, 8, 8, true);
        expect(block.x).toBeCloseTo(1, 5);
        expect(block.speed).toBeGreaterThan(0);
        expect(block.depth).toBeGreaterThan(0);
    });

    it("is nothing over a dry block, and leaves the dry cells out of a block half under water", () => {
        expect(
            flowOverBlock(
                state(40, 40, () => 0),
                undefined,
                8,
                8,
                8,
                true,
            ).depth,
        ).toBe(0);
        const half = flowOverBlock(
            state(40, 40, (x) => (x < 12 ? 10 : 0)),
            undefined,
            8,
            8,
            8,
            true,
        );
        expect(half.depth).toBe(10);
    });
});

describe("flowSpeedColor", () => {
    it("goes along the scale, and stays at its ends beyond them", () => {
        expect(flowSpeedColor(0)).toBe(FLOW_SPEED_SCALE[0].color);
        expect(flowSpeedColor(-1)).toBe(FLOW_SPEED_SCALE[0].color);
        expect(flowSpeedColor(0.5)).toBe(FLOW_SPEED_SCALE[1].color);
        expect(flowSpeedColor(99)).toBe(FLOW_SPEED_SCALE[FLOW_SPEED_SCALE.length - 1].color);
        const between = flowSpeedColor(1);
        expect(between).not.toBe(FLOW_SPEED_SCALE[1].color);
        expect(between).not.toBe(FLOW_SPEED_SCALE[2].color);
    });
});

describe("waterMassesOf", () => {
    it("tells each body of water apart, the largest first, with its volume, its surface and its mean depth", () => {
        // A lake of 10 x 10 cells under 32 px, a pond of 4 x 4 under 16 px, a film between them.
        const water = state(40, 20, (x, y) =>
            x >= 2 && x < 12 && y >= 2 && y < 12 ? 32 : x >= 30 && x < 34 && y >= 5 && y < 9 ? 16 : 0.5,
        );
        const masses = waterMassesOf(water);
        expect(masses.map((mass) => mass.cells)).toEqual([100, 16]);
        expect(masses[0].volumeM3).toBeCloseTo((100 * 32 * CELL_LITRES_PER_PX) / 1000, 5);
        expect(masses[0].areaM2).toBeCloseTo(100 * CELL_AREA_M2, 5);
        // 32 px of altitude are one tile high: about 1.10 m.
        expect(masses[0].meanDepthM).toBeCloseTo(1.095, 2);
        // The label hangs in the lake, near its middle (cell 6 or 7 on each axis, 16 px a cell).
        expect(masses[0].x).toBeGreaterThan(6 * 16);
        expect(masses[0].x).toBeLessThan(8 * 16);
        expect(masses[0].trendM3PerMinute).toBe(0);
    });

    it("leaves puddles out, and hangs the label of a ring of water on the water", () => {
        expect(waterMassesOf(state(20, 20, (x, y) => (x < 3 && y < 3 ? 10 : 0)))).toEqual([]);
        // A ring: water all around an island.
        const ring = state(20, 20, (x, y) => (x >= 6 && x < 14 && y >= 6 && y < 14 ? 0 : 10));
        const [mass] = waterMassesOf(ring);
        const column = Math.floor(mass.x / 16);
        const row = Math.floor(mass.y / 16);
        expect(ring.depths[row * 20 + column]).toBe(10);
    });

    it("tells how fast a body fills, in cubic metres a minute", () => {
        const water = state(
            20,
            20,
            (x, y) => (x < 10 && y < 10 ? 12 : 0),
            (x, y) => (x < 10 && y < 10 ? 10 : 0),
            2,
        );
        // 100 cells gained 2 px in 2 s: 100 px over one cell a second.
        expect(waterMassesOf(water)[0].trendM3PerMinute).toBeCloseTo(((100 * CELL_LITRES_PER_PX) / 1000) * 60, 5);
    });
});

describe("TerrainWater.settled", () => {
    const bytesOf = (depths: number[]): Uint8Array => {
        const bytes = new Uint8Array(depths.length * 2);
        depths.forEach((depth, index) => {
            bytes[index * 2] = (depth * 8) & 255;
            bytes[index * 2 + 1] = (depth * 8) >> 8;
        });
        return bytes;
    };

    it("keeps the state before the last one, and the time between the two", () => {
        const water = new TerrainWater();
        water.receive({ x: 3, y: 4, width: 2, height: 1, seq: 1, full: true, depths: bytesOf([10, 0]) }, 1000);
        // A single state: nothing to compare it with.
        expect(water.settled().seconds).toBe(Infinity);
        expect([...water.settled().before]).toEqual([10, 0]);
        water.receive({ x: 3, y: 4, width: 2, height: 1, seq: 2, full: true, depths: bytesOf([14, 2]) }, 3000);
        const settled = water.settled();
        expect(settled).toMatchObject({ x: 3, y: 4, width: 2, height: 1, seconds: 2 });
        expect([...settled.depths]).toEqual([14, 2]);
        expect([...settled.before]).toEqual([10, 0]);
        // Another grid (the relief was edited): the comparison starts again.
        water.receive({ x: 0, y: 0, width: 1, height: 1, seq: 3, full: true, depths: bytesOf([5]) }, 4000);
        expect(water.settled().seconds).toBe(Infinity);
    });
});

describe("TerrainWater glide", () => {
    const one = (depth: number): Uint8Array => Uint8Array.from([(depth * 8) & 255, (depth * 8) >> 8]);
    const state = (seq: number, depth: number) => ({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        seq,
        full: true,
        depths: one(depth),
    });

    it("glides to a state for as long as the server took to send it: a second, or less when told more often", () => {
        const slow = new TerrainWater();
        slow.receive(state(1, 0), 0);
        slow.receive(state(2, 10), 1000);
        // A second apart: half way after half a second.
        expect(slow.depthAt(8, 8, 1500)).toBeCloseTo(5, 5);
        const fast = new TerrainWater();
        fast.receive(state(1, 0), 0);
        fast.receive(state(2, 10), 200);
        // A fifth of a second apart: half way after a tenth, there after a fifth.
        expect(fast.depthAt(8, 8, 300)).toBeCloseTo(5, 5);
        expect(fast.depthAt(8, 8, 400)).toBe(10);
    });

    it("is drawn five times a second while it glides, however often the server tells it", () => {
        const water = new TerrainWater();
        water.receive(state(1, 0), 0);
        water.receive(state(2, 10), 100);
        const key = water.drawKey(110);
        // Another state in the same fifth of a second: no drawing of its own.
        water.receive(state(3, 12), 150);
        expect(water.drawKey(160)).toBe(key);
        expect(water.drawKey(210)).not.toBe(key);
        // Once at rest, drawn a last time and no more.
        expect(water.drawKey(5000)).toBe(water.drawKey(6000));
    });
});
