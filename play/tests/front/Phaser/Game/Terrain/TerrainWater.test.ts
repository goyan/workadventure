import { cellKey, withHeights } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { TerrainWater } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import type { WaterState } from "../../../../../src/front/Phaser/Game/Terrain/TerrainWater";
import { isDeepTerrainWater, SWIM_DEPTH_PX } from "../../../../../src/front/Phaser/Game/Water/WaterZones";

const pit = withHeights(undefined, new Map([[cellKey(0, 0), -32]]));
// A grid of 4 × 3 cells whose corner is the cell (-1, -1).
const bounds = { x: -1, y: -1, width: 4, height: 3 };
/** The bytes of a state: pixels of water for some cells of the grid, the others dry. */
function bytesOf(depths: Record<string, number>): Uint8Array {
    const bytes = new Uint8Array(bounds.width * bounds.height * 2);
    for (const [key, depth] of Object.entries(depths)) {
        const [x, y] = key.split(",").map(Number);
        const index = (y - bounds.y) * bounds.width + (x - bounds.x);
        const eighths = Math.round(depth * 8);
        bytes[index * 2] = eighths & 255;
        bytes[index * 2 + 1] = eighths >> 8;
    }
    return bytes;
}
const full = (seq: number, depths: Record<string, number>): WaterState => ({
    ...bounds,
    seq,
    full: true,
    depths: bytesOf(depths),
});
/** What changed between two states, as the server sends it. */
const change = (seq: number, before: Record<string, number>, after: Record<string, number>): WaterState => {
    const from = bytesOf(before);
    return { ...bounds, seq, full: false, depths: bytesOf(after).map((byte, index) => byte ^ from[index]) };
};

describe("TerrainWater", () => {
    it("is dry until the server says otherwise, then gives the depth of the water at a point", () => {
        const water = new TerrainWater();
        expect(water.hasAnything()).toBe(false);
        water.setTerrain(pit);
        expect(water.hasAnything()).toBe(true);
        expect(water.depthAt(8, 8, 0)).toBe(0);
        // The first state is shown at once: a player who joins does not see the lakes fill from nothing.
        water.receive(full(1, { "0,0": 20, "1,0": 3 }), 5000);
        expect(water.depthAt(8, 8, 5000)).toBe(20);
        expect(water.depthAt(15, 15, 5000)).toBe(20);
        expect(water.depthAt(24, 8, 5000)).toBe(3);
        expect(water.depthAt(-8, 8, 5000)).toBe(0);
        // Outside the grid.
        expect(water.depthAt(900, 900, 5000)).toBe(0);
        expect(water.depthAt(-900, 8, 5000)).toBe(0);
    });

    it("shows the water of a source on a map without relief", () => {
        const water = new TerrainWater();
        water.receive(full(1, { "1,1": 2 }), 0);
        expect(water.hasAnything()).toBe(true);
        expect(water.depthAt(24, 24, 0)).toBe(2);
    });

    it("glides from one state to the next over a second, without a jump", () => {
        const water = new TerrainWater();
        water.receive(full(1, { "0,0": 10 }), 0);
        water.receive(change(2, { "0,0": 10 }, { "0,0": 20, "1,0": 4 }), 1000);
        expect(water.depthAt(8, 8, 1000)).toBe(10);
        expect(water.depthAt(8, 8, 1500)).toBeCloseTo(15);
        expect(water.depthAt(24, 8, 1500)).toBeCloseTo(2);
        expect(water.depthAt(8, 8, 2000)).toBe(20);
        expect(water.depthAt(8, 8, 9000)).toBe(20);
        // A new state while gliding starts from where the water is shown.
        water.receive(change(3, { "0,0": 20, "1,0": 4 }, { "0,0": 0, "1,0": 4 }), 10_000);
        water.receive(change(4, { "0,0": 0, "1,0": 4 }, { "0,0": 20, "1,0": 4 }), 10_500);
        expect(water.depthAt(8, 8, 10_500)).toBeCloseTo(10);
    });

    it("waits for the next whole state when it missed a change", () => {
        const water = new TerrainWater();
        water.receive(full(1, { "0,0": 10 }), 0);
        // The change 2 never came: the change 3 cannot be applied.
        water.receive(change(3, { "0,0": 12 }, { "0,0": 14 }), 2000);
        expect(water.depthAt(8, 8, 9000)).toBe(10);
        water.receive(change(4, { "0,0": 14 }, { "0,0": 16 }), 3000);
        expect(water.depthAt(8, 8, 9000)).toBe(10);
        water.receive(full(5, { "0,0": 18 }), 4000);
        expect(water.depthAt(8, 8, 9000)).toBe(18);
        water.receive(change(6, { "0,0": 18 }, { "0,0": 19 }), 10_000);
        expect(water.depthAt(8, 8, 20_000)).toBe(19);
    });

    it("ignores a state of the wrong size, and follows a grid that changed", () => {
        const water = new TerrainWater();
        water.receive(full(1, { "0,0": 10 }), 0);
        water.receive({ ...bounds, seq: 2, full: true, depths: new Uint8Array(5) }, 1000);
        expect(water.depthAt(8, 8, 5000)).toBe(10);
        // The relief was edited: the grid of the server moved by one cell.
        const moved = { x: 0, y: -1, width: 4, height: 3 };
        const bytes = new Uint8Array(24);
        bytes[(1 * 4 + 0) * 2] = 80;
        water.receive({ ...moved, seq: 3, full: true, depths: bytes }, 6000);
        expect(water.depthAt(8, 8, 6000)).toBe(10);
        expect(water.depthAt(24, 8, 9000)).toBe(0);
    });

    it("gives the levels to draw over a canvas, and leaves out a film too thin to be seen", () => {
        const water = new TerrainWater();
        water.setTerrain(pit);
        water.receive(full(1, { "0,0": 12, "1,0": 0.125, "2,1": 300 }), 0);
        // A canvas of 3 × 2 cells whose corner is the cell (0, 0).
        const levels = new Uint8Array(6);
        expect(water.levelsOver(0, 0, 3, 2, 5000, levels)).toBe(true);
        expect([...levels]).toEqual([12, 0, 0, 0, 0, 255]);
    });

    it("says when what it shows changed: the relief, a state, or the water gliding", () => {
        const water = new TerrainWater();
        const empty = water.drawKey(0);
        water.setTerrain(pit);
        const dug = water.drawKey(0);
        expect(dug).not.toBe(empty);
        water.setTerrain(pit);
        expect(water.drawKey(0)).toBe(dug);
        water.receive(full(1, { "0,0": 10 }), 0);
        const first = water.drawKey(0);
        expect(first).not.toBe(dug);
        // A whole state shown at once does not glide.
        expect(water.drawKey(500)).toBe(first);
        water.receive(change(2, { "0,0": 10 }, { "0,0": 20 }), 1000);
        expect(water.drawKey(1100)).not.toBe(water.drawKey(1300));
        // Once the water is where the server said, the key no longer changes with the time.
        expect(water.drawKey(5000)).toBe(water.drawKey(90_000));
    });
});

describe("swimming in the water of the relief", () => {
    const depth = (value: number) => ({ depthAt: () => value });
    it("swims over half a tile of water, walks under", () => {
        expect(SWIM_DEPTH_PX).toBe(16);
        expect(isDeepTerrainWater(depth(16), { x: 0, y: 0 }, 0)).toBe(true);
        expect(isDeepTerrainWater(depth(40), { x: 0, y: 0 }, 0)).toBe(true);
        expect(isDeepTerrainWater(depth(15.9), { x: 0, y: 0 }, 0)).toBe(false);
        expect(isDeepTerrainWater(depth(0), { x: 0, y: 0 }, 0)).toBe(false);
        expect(isDeepTerrainWater(undefined, { x: 0, y: 0 }, 0)).toBe(false);
    });

    it("reads the water as it is drawn, between the centres of the cells, not by squares of 16 px", () => {
        // 20 px of water on the cell 0,0, none east of it: at x 15 the water drawn is about 11 px deep, one wades.
        const water = { depthAt: (x: number) => (Math.floor(x / 16) === 0 ? 20 : 0) };
        expect(isDeepTerrainWater(water, { x: 8, y: 8 }, 0)).toBe(true);
        expect(isDeepTerrainWater(water, { x: 15, y: 8 }, 0)).toBe(false);
    });

    it("reads the water of the cell under the point where the water is not drawn smooth (the other engine)", () => {
        const water = { depthAt: (x: number) => (Math.floor(x / 16) === 0 ? 20 : 0) };
        expect(isDeepTerrainWater(water, { x: 15, y: 8 }, 0, false)).toBe(true);
        expect(isDeepTerrainWater(water, { x: 17, y: 8 }, 0, false)).toBe(false);
    });
});

describe("the bridges over the water of the relief", () => {
    const flooded = (): TerrainWater => {
        const water = new TerrainWater();
        water.setTerrain(pit);
        water.receive(full(1, { "0,0": 40, "1,0": 40, "2,0": 40 }), 0);
        return water;
    };

    it("what walks reads no water on the tile of a bridge, and the water beside it", () => {
        const water = flooded();
        // The tile (0, 0) holds the cells (0, 0) and (1, 0); the cell (2, 0) is on the tile (1, 0).
        water.setBridges(new Set(["0,0"]));
        expect(water.isBridgeAt(20, 5)).toBe(true);
        expect(water.isBridgeAt(40, 5)).toBe(false);
        expect(water.walkerSettledDepthAt(20, 5)).toBe(0);
        expect(water.walkerSettledDepthAt(40, 5)).toBe(40);
        // The water itself is still there under the deck: it is drawn, and the fish swim in it.
        expect(water.settledDepthAt(20, 5)).toBe(40);
        expect(isDeepTerrainWater(water, { x: 20, y: 5 }, 10_000)).toBe(false);
        expect(isDeepTerrainWater(water, { x: 40, y: 5 }, 10_000)).toBe(true);
    });

    it("the water is back as soon as the bridge is taken away, and what reads it is told", () => {
        const water = flooded();
        water.setBridges(new Set(["0,0"]));
        const version = water.version();
        water.setBridges(new Set());
        expect(water.version()).not.toBe(version);
        expect(isDeepTerrainWater(water, { x: 20, y: 5 }, 10_000)).toBe(true);
        // The same bridges told again change nothing.
        const same = water.version();
        water.setBridges(new Set());
        expect(water.version()).toBe(same);
    });
});
