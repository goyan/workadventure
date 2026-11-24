import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZOMBIE_GONE, ZOMBIE_STEP_MS, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    decodeZombieTerrain,
    encodeZombieTerrain,
    zombieAsk,
    zombieDirection,
    zombieTerrainHash,
    zombieTerrainOf,
    ZOMBIE_DEEP,
    ZOMBIE_DRY,
    ZOMBIE_SHALLOW,
    ZOMBIE_UNDER,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde } from "../src/Catastrophe/ZombieHorde";
import { Meadow, ZOMBIE_TRAMPLE_HALF_PASSES } from "../src/Terrain/Meadow";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
/** The checksum of the reference crowd (see its test): set once, changed only with the model. */
const REFERENCE_CHECKSUM = 419686176;

/** A horde over a map of `widthCells` x `heightCells` cells, with that water. */
function horde(
    overrides: Partial<ZombieHorde> = {},
    terrain?: Uint8Array,
    widthCells = 120,
    heightCells = 80,
): ZombieHorde {
    const heading = overrides.heading ?? 90;
    return {
        id: 1,
        seed: 12345,
        count: 300,
        durationMs: 2 * 60_000,
        heading,
        startedAt: START,
        ...zombieDirection(heading),
        anchorX: (widthCells * TERRAIN_CELL) / 2,
        anchorY: (heightCells * TERRAIN_CELL) / 2,
        widthCells,
        heightCells,
        terrain: encodeZombieTerrain(terrain ?? new Uint8Array(widthCells * heightCells)),
        ...overrides,
    };
}

/** The walls of a closed box of cells [x0, x1) x [y0, y1). */
function box(x0: number, y0: number, x1: number, y1: number): { east: Set<string>; south: Set<string> } {
    const east = new Set<string>();
    const south = new Set<string>();
    for (let y = y0; y < y1; y++) {
        east.add(cellKey(x0 - 1, y));
        east.add(cellKey(x1 - 1, y));
    }
    for (let x = x0; x < x1; x++) {
        south.add(cellKey(x, y0 - 1));
        south.add(cellKey(x, y1 - 1));
    }
    return { east, south };
}

describe("the terrain of a horde", () => {
    it("is told in a few bytes and read back the same", () => {
        const classes = zombieTerrainOf(200, 100, (x, y) => (x > 50 && x < 120 && y > 20 && y < 70 ? x - 40 : 0));
        expect(new Set(classes)).toEqual(new Set([ZOMBIE_DRY, ZOMBIE_SHALLOW, ZOMBIE_DEEP, ZOMBIE_UNDER]));
        const text = encodeZombieTerrain(classes);
        expect(text.length).toBeLessThan(1000);
        expect(decodeZombieTerrain(text, classes.length)).toEqual(classes);
        expect(zombieTerrainHash(text)).toBe(zombieTerrainHash(encodeZombieTerrain(classes.slice())));
    });

    it("is dry on the deck of a bridge", () => {
        const classes = zombieTerrainOf(
            4,
            1,
            () => 30,
            (x) => x === 1,
        );
        expect([...classes]).toEqual([ZOMBIE_DEEP, ZOMBIE_DRY, ZOMBIE_DEEP, ZOMBIE_DEEP]);
    });

    it("keeps what a player asks within bounds", () => {
        expect(zombieAsk({ count: 1_000_000, minutes: 99, heading: -90 })).toEqual({
            count: 4000,
            durationMs: 15 * 60_000,
            heading: 270,
        });
        expect(zombieAsk({})).toEqual({ count: 2000, durationMs: 6 * 60_000, heading: 270 });
    });
});

describe("a crowd of zombies", () => {
    it("is the same crowd wherever it is stepped, in one go or in slices", () => {
        const told = horde();
        const whole = new ZombieCrowd(told, undefined);
        const sliced = new ZombieCrowd(told, undefined);
        const at = START + 40_000;
        whole.advanceTo(at);
        // Slices of every length, as a browser and the thread of the ground take them.
        let slice = 1;
        while (!sliced.advanceTo(at, slice)) slice = (slice * 7 + 3) % 13;
        expect(sliced.steps).toBe(whole.steps);
        expect(sliced.checksum()).toBe(whole.checksum());
        expect(sliced.takeTrample()).toEqual(whole.takeTrample());
        // Another seed is another crowd.
        const other = new ZombieCrowd({ ...told, seed: 54321 }, undefined);
        other.advanceTo(at);
        expect(other.checksum()).not.toBe(whole.checksum());
    });

    it("crosses open ground the way it goes, and is gone by its end", () => {
        const told = horde();
        const crowd = new ZombieCrowd(told, undefined);
        crowd.advanceTo(START + 30_000);
        expect(crowd.walking).toBeGreaterThan(100);
        // Walking east: their mean velocity points east.
        let east = 0;
        let south = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            east += crowd.vx[zombie];
            south += crowd.vy[zombie];
        }
        expect(east).toBeGreaterThan(10 * Math.abs(south));
        crowd.advanceTo(START + told.durationMs);
        expect(crowd.over()).toBe(true);
        expect([...crowd.state].every((state) => state === ZOMBIE_GONE)).toBe(true);
    });

    it("walks out by the far side, most of it before the end", () => {
        const told = horde();
        const crowd = new ZombieCrowd(told, undefined);
        crowd.advanceTo(START + told.durationMs - ZOMBIE_STEP_MS * 2);
        let gone = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) gone++;
        expect(gone / crowd.count).toBeGreaterThan(0.9);
    });

    it("never walks into a building, and goes round it", () => {
        // A closed box in the middle of the way.
        const walls = box(50, 25, 70, 55);
        const told = horde();
        const crowd = new ZombieCrowd(told, walls);
        expect(crowd.potential[40 * 120 + 60]).toBe(Number.POSITIVE_INFINITY);
        for (let step = 0; step < crowd.lastStep; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                const cellX = Math.floor(crowd.x[zombie] / TERRAIN_CELL);
                const cellY = Math.floor(crowd.y[zombie] / TERRAIN_CELL);
                const inside = cellX >= 50 && cellX < 70 && cellY >= 25 && cellY < 55;
                expect(inside).toBe(false);
            }
        }
        expect(crowd.over()).toBe(true);
    });

    it("goes round a deep lake rather than through it, and slows in the shallows", () => {
        const width = 120;
        const height = 80;
        const water = new Uint8Array(width * height);
        // A lake over the head across the middle of the way, a shallow rim around it.
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const d = Math.sqrt((x - 60) ** 2 + (y - 40) ** 2);
                if (d < 16) water[y * width + x] = ZOMBIE_UNDER;
                else if (d < 19) water[y * width + x] = ZOMBIE_SHALLOW;
            }
        }
        const told = horde({}, water);
        const crowd = new ZombieCrowd(told, undefined);
        let walked = 0;
        let under = 0;
        for (let step = 0; step < crowd.lastStep; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                walked++;
                if (crowd.waterAt(crowd.x[zombie], crowd.y[zombie]) === ZOMBIE_UNDER) under++;
            }
        }
        // The lake lies across a third of the front: a crowd that went through would spend a share of its steps in it.
        expect(under / walked).toBeLessThan(0.005);
    });

    it("packs and jams at a gap in a wall across its way", () => {
        const height = 80;
        // A wall across the map at x = 60, open on four cells (2 tiles) in the middle.
        const east = new Set<string>();
        for (let y = 0; y < height; y++) if (y < 38 || y >= 42) east.add(cellKey(59, y));
        const told = horde({ count: 600 });
        const crowd = new ZombieCrowd(told, { east, south: new Set() });
        let crossed = 0;
        let densest = 0;
        crowd.advanceTo(START + 60_000);
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] === ZOMBIE_GONE || crowd.x[zombie] >= 60 * TERRAIN_CELL) crossed++;
        }
        // Behind the gap, the crowd is denser than it walked in open ground (1 per m², about 1.2 a tile).
        const tiles = new Map<string, number>();
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            const key = `${Math.floor(crowd.x[zombie] / TILE_PX)},${Math.floor(crowd.y[zombie] / TILE_PX)}`;
            tiles.set(key, (tiles.get(key) ?? 0) + 1);
        }
        for (const crowded of tiles.values()) densest = Math.max(densest, crowded);
        expect(crossed).toBeGreaterThan(20);
        expect(crossed).toBeLessThan(crowd.count);
        expect(densest).toBeGreaterThanOrEqual(3);
        // Nobody went through the wall: whoever is east of it came through the gap.
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            const cellX = Math.floor(crowd.x[zombie] / TERRAIN_CELL);
            const lastCellX = Math.floor(crowd.lastX[zombie] / TERRAIN_CELL);
            const cellY = Math.floor(crowd.y[zombie] / TERRAIN_CELL);
            if (lastCellX === 59 && cellX === 60) expect(cellY >= 38 && cellY < 42).toBe(true);
        }
    });

    it("tramples a band as wide as its front, over every tile it walked", () => {
        const told = horde({ count: 400 });
        const crowd = new ZombieCrowd(told, undefined);
        crowd.advanceTo(START + told.durationMs);
        const trampled = crowd.takeTrample();
        expect(trampled.length).toBeGreaterThan(50);
        const rows = new Set(trampled.filter((tile) => tile.passes > 1).map((tile) => tile.tileY));
        // 400 zombies come in on a front of sqrt(400 * 3) m, about 35 m (32 tiles), in the middle of 40 tiles.
        expect(rows.size).toBeGreaterThan(20);
        expect(rows.size).toBeLessThanOrEqual(40);
        // Taken, nothing is left.
        expect(crowd.takeTrample()).toEqual([]);
    });

    it("is the crowd it was: the same number after the same steps, with walls and water", () => {
        // 1500 steps of 2000 zombies over this map gave 1078317079 under Node, Chrome, Firefox and JavaScriptCore
        // (.superpowers/harness of the branch). A change of the model changes this number: it is then a new model,
        // which a browser running the old one does not draw the same.
        const width = 160;
        const height = 100;
        const water = zombieTerrainOf(width, height, (x, y) => (Math.abs(x - 80) < 6 && (y < 40 || y > 50) ? 50 : 0));
        const told = horde({ count: 400, heading: 250, ...zombieDirection(250) }, water, width, height);
        const crowd = new ZombieCrowd(told, box(30, 20, 50, 40));
        for (let step = 0; step < 600; step++) crowd.step();
        expect(crowd.checksum()).toBe(REFERENCE_CHECKSUM);
    });

    it("steps with nothing but what every engine computes the same", () => {
        const source = readFileSync(new URL("../src/Catastrophe/ZombieCrowd.ts", import.meta.url), "utf8");
        // The comments may name them; the code may not.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        for (const forbidden of [
            /Math\.(hypot|sin|cos|tan|atan|atan2|exp|log|log2|log10|pow|cbrt|random)\b/,
            /\*\*/,
            /\.sort\(/,
        ]) {
            expect(code).not.toMatch(forbidden);
        }
    });
});

describe("the grass a horde of zombies goes over", () => {
    it("loses half of it every ZOMBIE_TRAMPLE_HALF_PASSES passes, and does not grow back above what was left", () => {
        const meadow = new Meadow({ width: 4, height: 4 }, undefined, undefined);
        meadow.set(1, 1, 0.4, 0.8);
        expect(meadow.trample(1, 1, ZOMBIE_TRAMPLE_HALF_PASSES)).toBeCloseTo(0.4, 5);
        expect(meadow.trample(1, 1, 2 * ZOMBIE_TRAMPLE_HALF_PASSES)).toBeCloseTo(0.1, 5);
        // Outside the meadow: nothing.
        expect(meadow.trample(9, 9, 10)).toBeUndefined();
        meadow.set(1, 1, 0.4, 0.6);
        meadow.holdGrass(1, 1, 0.1);
        expect(meadow.grassAt(1, 1)).toBeCloseTo(0.1, 5);
        meadow.holdGrass(1, 1, 0.5);
        expect(meadow.grassAt(1, 1)).toBeCloseTo(0.1, 5);
    });
});
