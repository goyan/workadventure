import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZOMBIE_GONE, ZOMBIE_SHOVE_MOST_M_S, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    decodeZombieLog,
    decodeZombieTerrain,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieAsk,
    zombieCollisionsOf,
    zombieDirection,
    zombieHordeGoing,
    zombieMsLeft,
    zombieSpedUp,
    zombieStepAt,
    zombieTerrainHash,
    zombieTerrainOf,
    ZOMBIE_EAST,
    ZOMBIE_SOLID,
    ZOMBIE_SOUTH,
    ZOMBIE_WATER,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { Meadow, ZOMBIE_TRAMPLE_HALF_PASSES } from "../src/Terrain/Meadow";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
/** The checksum of the reference crowd (see its test): set once, changed only with the model. */
const REFERENCE_CHECKSUM = 328346713;

/** The walls of a closed box of cells [x0, x1) x [y0, y1), with an opening of `door` cells in its east side. */
function box(x0: number, y0: number, x1: number, y1: number, door = 0): { east: Set<string>; south: Set<string> } {
    const east = new Set<string>();
    const south = new Set<string>();
    const doorFrom = Math.floor((y0 + y1 - door) / 2);
    for (let y = y0; y < y1; y++) {
        east.add(cellKey(x0 - 1, y));
        if (y < doorFrom || y >= doorFrom + door) east.add(cellKey(x1 - 1, y));
    }
    for (let x = x0; x < x1; x++) {
        south.add(cellKey(x, y0 - 1));
        south.add(cellKey(x, y1 - 1));
    }
    return { east, south };
}

/** A horde over a map of `widthCells` x `heightCells` cells, over that ground, at the speed of reality. */
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
        anchorStep: 0,
        anchorAt: START,
        msPerStep: 100,
        ...zombieDirection(heading),
        anchorX: (widthCells * TERRAIN_CELL) / 2,
        anchorY: (heightCells * TERRAIN_CELL) / 2,
        widthCells,
        heightCells,
        terrain: encodeZombieTerrain(terrain ?? new Uint8Array(widthCells * heightCells)),
        avatars: "",
        safeStep: 1_000_000,
        ...overrides,
    };
}

/** The tile index of a point of a map `widthCells` cells wide. */
const tileAt = (x: number, y: number, widthCells = 120): number =>
    Math.floor(y / TILE_PX) * Math.ceil((widthCells * TERRAIN_CELL) / TILE_PX) + Math.floor(x / TILE_PX);

describe("the ground of a horde", () => {
    it("holds its water, its walls and the collisions of the map, told in a few bytes and read back the same", () => {
        const cells = zombieTerrainOf(
            200,
            100,
            (x, y) => (x > 50 && x < 120 && y > 20 && y < 70 ? 5 : 0),
            (x) => x === 60,
            { east: new Set([cellKey(10, 10)]), south: new Set([cellKey(11, 12)]) },
            (tileX, tileY) => tileX === 80 && tileY === 40,
        );
        expect(cells[30 * 200 + 55] & ZOMBIE_WATER).toBe(ZOMBIE_WATER);
        // The deck of a bridge is dry.
        expect(cells[30 * 200 + 60] & ZOMBIE_WATER).toBe(0);
        expect(cells[10 * 200 + 10]).toBe(ZOMBIE_EAST);
        expect(cells[12 * 200 + 11]).toBe(ZOMBIE_SOUTH);
        expect(cells[81 * 200 + 161]).toBe(ZOMBIE_SOLID);
        const text = encodeZombieTerrain(cells);
        expect(text.length).toBeLessThan(1000);
        expect(decodeZombieTerrain(text, cells.length)).toEqual(cells);
        expect(zombieTerrainHash(text)).toBe(zombieTerrainHash(encodeZombieTerrain(cells.slice())));
    });

    it("reads the collisions the browser walks by, a tile each, with the tiles of the doors open", () => {
        const grid = [
            [0, 1, 1, 0],
            [0, 1, 1, 0],
            [0, 0, 0, 0],
        ];
        // A door whose leaf closes the east side of the cell (3, 0): tiles (1, 0) and (2, 0) stay open.
        const told = zombieCollisionsOf(grid, [{ east: [cellKey(3, 0)], south: [] }]);
        expect(told).toMatchObject({ collisionsWidth: 4, collisionsHeight: 3 });
        expect([...decodeZombieTerrain(told.collisions, 12)]).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
    });

    it("tells the log of the avatars and reads it back the same", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 25, changes: [{ slot: 0, tile: 1234 }] },
            {
                applyStep: 40,
                changes: [
                    { slot: 1, tile: 0 },
                    { slot: 0, tile: -1 },
                ],
            },
            { applyStep: 9000, changes: [] },
        ];
        expect(decodeZombieLog(encodeZombieLog(log))).toEqual(log);
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

describe("the clock of a horde", () => {
    it("goes on from the same step when the map is sped up, and the server and a browser stay together", () => {
        const told = horde({ count: 200 });
        // The server: ×1 for 20 s, then ×5 (the widget of the speed of the map).
        const sped = zombieSpedUp(told, 5, START + 20_000);
        expect(zombieStepAt(sped, START + 20_000)).toBeCloseTo(200, 9);
        expect(zombieStepAt(sped, START + 21_000)).toBeCloseTo(250, 9);
        expect(sped.msPerStep).toBe(20);
        expect(Number.isInteger(zombieMsLeft(sped, START + 20_003))).toBe(true);
        expect(zombieHordeGoing(sped, START + 20_000 + (1200 - 200) * 20 - 1)).toBe(true);
        expect(zombieHordeGoing(sped, START + 20_000 + (1200 - 200) * 20 + 1)).toBe(false);
        // The server steps its crowd at its own times and speeds up at 20 s; a browser hears of it 700 ms late.
        const server = new ZombieCrowd(told);
        server.advanceTo(START + 20_000);
        server.setClock(sped);
        server.advanceTo(START + 30_000);
        const browser = new ZombieCrowd(told);
        browser.advanceTo(START + 13_000);
        browser.advanceTo(START + 20_700);
        browser.setClock(sped);
        browser.advanceTo(START + 30_000);
        expect(browser.steps).toBe(server.steps);
        expect(browser.steps).toBe(701);
        expect(browser.checksum()).toBe(server.checksum());
    });
});

describe("a crowd of zombies", () => {
    it("is the same crowd wherever it is stepped, in one go or in slices", () => {
        const told = horde();
        const whole = new ZombieCrowd(told);
        const sliced = new ZombieCrowd(told);
        const at = START + 40_000;
        whole.advanceTo(at);
        let slice = 1;
        while (!sliced.advanceTo(at, slice)) slice = (slice * 7 + 3) % 13;
        expect(sliced.steps).toBe(whole.steps);
        expect(sliced.checksum()).toBe(whole.checksum());
        expect(sliced.takeTrample()).toEqual(whole.takeTrample());
        const other = new ZombieCrowd({ ...told, seed: 54321 });
        other.advanceTo(at);
        expect(other.checksum()).not.toBe(whole.checksum());
    });

    it("never steps past the log of the avatars: a lost message stalls it, then it goes on the same", () => {
        const told = horde();
        const stalled = new ZombieCrowd({ ...told, safeStep: 49 });
        stalled.advanceTo(START + 30_000);
        expect(stalled.steps).toBe(50);
        expect(stalled.stalled(START + 30_000)).toBe(true);
        stalled.setLog("", 1_000_000);
        stalled.advanceTo(START + 30_000);
        const straight = new ZombieCrowd(told);
        straight.advanceTo(START + 30_000);
        expect(stalled.checksum()).toBe(straight.checksum());
    });

    it("runs the same with the log of the avatars told whole or bit by bit, as the server and a browser hear it", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 25, changes: [{ slot: 0, tile: tileAt(900, 600) }] },
            { applyStep: 140, changes: [{ slot: 1, tile: tileAt(1200, 300) }] },
            { applyStep: 260, changes: [{ slot: 0, tile: tileAt(940, 640) }] },
            { applyStep: 400, changes: [{ slot: 1, tile: -1 }] },
        ];
        const whole = new ZombieCrowd(horde({ count: 300, avatars: encodeZombieLog(log), safeStep: 1_000_000 }));
        whole.advanceTo(START + 50_000);
        // A browser: told each second the log so far, complete to 2.5 s ahead, stepping image by image.
        const bitByBit = new ZombieCrowd(horde({ count: 300, avatars: "", safeStep: -1 }));
        for (let second = 0; second < 50; second++) {
            const told = log.filter((entry) => entry.applyStep <= second * 10 + 24);
            bitByBit.setLog(encodeZombieLog(told), second * 10 + 24);
            for (let image = 1; image <= 6; image++) bitByBit.advanceTo(START + second * 1000 + image * 166, 3);
        }
        bitByBit.setLog(encodeZombieLog(log), 1_000_000);
        bitByBit.advanceTo(START + 50_000);
        expect(bitByBit.steps).toBe(whole.steps);
        expect(bitByBit.checksum()).toBe(whole.checksum());
    });

    it("runs across open ground the way it goes, and is gone by its end", () => {
        const told = horde();
        const crowd = new ZombieCrowd(told);
        crowd.advanceTo(START + 15_000);
        expect(crowd.walking).toBeGreaterThan(20);
        let east = 0;
        let south = 0;
        let speed = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            east += crowd.vx[zombie];
            south += crowd.vy[zombie];
            speed += Math.sqrt(crowd.vx[zombie] ** 2 + crowd.vy[zombie] ** 2);
        }
        expect(east).toBeGreaterThan(5 * Math.abs(south));
        // A run: over 2 m/s on average (29 px a metre), in a crowd.
        expect(speed / crowd.walking).toBeGreaterThan(2 * 29);
        crowd.advanceTo(START + told.durationMs);
        expect(crowd.over()).toBe(true);
        expect([...crowd.state].every((state) => state === ZOMBIE_GONE)).toBe(true);
    });

    it("never goes into a closed building, nor through a wall", () => {
        const walls = box(50, 25, 70, 55);
        const terrain = zombieTerrainOf(120, 80, () => 0, undefined, walls);
        const crowd = new ZombieCrowd(horde({}, terrain));
        expect(crowd.potential[40 * 120 + 60]).toBe(Number.POSITIVE_INFINITY);
        for (let step = 0; step < crowd.lastStep; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                const cellX = Math.floor(crowd.x[zombie] / TERRAIN_CELL);
                const cellY = Math.floor(crowd.y[zombie] / TERRAIN_CELL);
                expect(cellX >= 50 && cellX < 70 && cellY >= 25 && cellY < 55).toBe(false);
            }
        }
    });

    it("keeps out of the water, even shallow, and of the collisions; it crosses a river by its bridge, and packs there", () => {
        const width = 120;
        const height = 80;
        // A river across the map, a bridge of 4 cells (2 tiles) over it, and a pond in a corner.
        const terrain = zombieTerrainOf(
            width,
            height,
            (x, y) => (x >= 58 && x < 64 ? 3 : (x - 20) ** 2 + (y - 60) ** 2 < 64 ? 3 : 0),
            (x, y) => x >= 58 && x < 64 && y >= 38 && y < 42,
            undefined,
            (tileX, tileY) => tileX === 45 && tileY >= 10 && tileY < 30,
        );
        const crowd = new ZombieCrowd(horde({ count: 400 }, terrain));
        let densest = 0;
        let crossed = 0;
        for (let step = 0; step < crowd.lastStep - 1; step++) {
            crowd.step();
            const tiles = new Map<number, number>();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                const cell =
                    Math.floor(crowd.y[zombie] / TERRAIN_CELL) * width + Math.floor(crowd.x[zombie] / TERRAIN_CELL);
                expect(crowd.terrain[cell] & (ZOMBIE_WATER | ZOMBIE_SOLID)).toBe(0);
                const tile = tileAt(crowd.x[zombie], crowd.y[zombie]);
                tiles.set(tile, (tiles.get(tile) ?? 0) + 1);
            }
            for (const crowded of tiles.values()) densest = Math.max(densest, crowded);
        }
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) crossed++;
        // All over the bridge, out by the far side, and packed at its head on the way.
        expect(crossed / crowd.count).toBeGreaterThan(0.9);
        expect(densest).toBeGreaterThanOrEqual(4);
    });

    it("comes in by the shore when its edge is half sea, not from the water", () => {
        const width = 120;
        const height = 80;
        const terrain = zombieTerrainOf(width, height, (x, y) => (x >= width - 12 && y < 40 ? 60 : 0));
        const crowd = new ZombieCrowd(horde({ heading: 270, ...zombieDirection(270) }, terrain));
        crowd.advanceTo(START + 20_000);
        expect(crowd.walking).toBeGreaterThan(20);
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            const cell =
                Math.floor(crowd.y[zombie] / TERRAIN_CELL) * width + Math.floor(crowd.x[zombie] / TERRAIN_CELL);
            expect(crowd.terrain[cell] & ZOMBIE_WATER).toBe(0);
        }
    });

    it("runs to an avatar near its way, comes within 5 tiles of it, then goes on and out", () => {
        // An avatar standing 12 tiles off the middle of the way, from the first step.
        const avatarX = 60 * TERRAIN_CELL;
        const avatarY = 40 * TERRAIN_CELL + 12 * TILE_PX;
        const told = horde({
            count: 100,
            avatars: encodeZombieLog([{ applyStep: 0, changes: [{ slot: 0, tile: tileAt(avatarX, avatarY) }] }]),
        });
        const crowd = new ZombieCrowd(told);
        let ran = false;
        let came = false;
        for (let step = 0; step < crowd.lastStep - 1; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                if (crowd.target[zombie] === 0) ran = true;
                const dx = crowd.x[zombie] - (Math.floor(avatarX / TILE_PX) + 0.5) * TILE_PX;
                const dy = crowd.y[zombie] - (Math.floor(avatarY / TILE_PX) + 0.5) * TILE_PX;
                if (dx * dx + dy * dy < (5 * TILE_PX) ** 2) came = true;
            }
        }
        let gone = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) gone++;
        expect(ran).toBe(true);
        expect(came).toBe(true);
        expect(gone / crowd.count).toBeGreaterThan(0.9);
    });

    it("senses an avatar anywhere on the map, some 200 m away, and runs to it", () => {
        // A map 400 cells long (some 220 m), the avatar at its far end: far beyond what a voice carries.
        const width = 400;
        const height = 80;
        const far = tileAt(390 * TERRAIN_CELL, 40 * TERRAIN_CELL, width);
        const told = horde(
            {
                count: 200,
                // Long enough for the way across not to press yet.
                durationMs: 6 * 60_000,
                avatars: encodeZombieLog([{ applyStep: 0, changes: [{ slot: 0, tile: far }] }]),
            },
            undefined,
            width,
            height,
        );
        const crowd = new ZombieCrowd(told);
        for (let step = 0; step < 100; step++) crowd.step();
        let running = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] === ZOMBIE_WALKING && crowd.target[zombie] === 0) running++;
        }
        expect(crowd.walking).toBeGreaterThan(5);
        expect(running).toBe(crowd.walking);
    });

    it("goes into a closed room by its door to the avatar inside, comes within 5 tiles, comes out and crosses", () => {
        const width = 120;
        const height = 80;
        // A room in the middle, its door (2 tiles) on its east side, the avatar against its west wall.
        const walls = box(50, 30, 70, 50, 4);
        const terrain = zombieTerrainOf(width, height, () => 0, undefined, walls);
        const avatarX = 52 * TERRAIN_CELL;
        const avatarY = 40 * TERRAIN_CELL;
        const told = horde(
            {
                count: 600,
                heading: 270,
                ...zombieDirection(270),
                durationMs: 3 * 60_000,
                avatars: encodeZombieLog([{ applyStep: 0, changes: [{ slot: 0, tile: tileAt(avatarX, avatarY) }] }]),
            },
            terrain,
        );
        const crowd = new ZombieCrowd(told);
        let inside = 0;
        let came = 0;
        const seenInside = new Set<number>();
        for (let step = 0; step < crowd.lastStep - 1; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                const cellX = Math.floor(crowd.x[zombie] / TERRAIN_CELL);
                const cellY = Math.floor(crowd.y[zombie] / TERRAIN_CELL);
                if (cellX >= 50 && cellX < 70 && cellY >= 30 && cellY < 50 && !seenInside.has(zombie)) {
                    seenInside.add(zombie);
                    inside++;
                }
                const dx = crowd.x[zombie] - (Math.floor(avatarX / TILE_PX) + 0.5) * TILE_PX;
                const dy = crowd.y[zombie] - (Math.floor(avatarY / TILE_PX) + 0.5) * TILE_PX;
                if (dx * dx + dy * dy < (5 * TILE_PX) ** 2) came++;
            }
        }
        let gone = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) gone++;
        expect(inside).toBeGreaterThan(20);
        expect(came).toBeGreaterThan(0);
        // The door is a bottleneck: most get out all the same, in time.
        expect(gone / crowd.count).toBeGreaterThan(0.85);
    });

    it("runs to every avatar of a meeting, not only to the one nearest the door", () => {
        // Twelve avatars in a closed room, its door on its east side: the one nearest the door is the nearest to the
        // whole map outside. Once it has its share, or a zombie is done with it, the others are run to.
        const width = 160;
        const height = 80;
        const terrain = zombieTerrainOf(width, height, () => 0, undefined, box(40, 20, 80, 60, 4));
        const changes = [];
        for (let slot = 0; slot < 12; slot++) {
            const x = (44 + (slot % 4) * 9) * TERRAIN_CELL;
            const y = (24 + Math.floor(slot / 4) * 12) * TERRAIN_CELL;
            changes.push({ slot, tile: tileAt(x, y, width) });
        }
        const told = horde(
            {
                count: 1500,
                heading: 270,
                ...zombieDirection(270),
                durationMs: 6 * 60_000,
                avatars: encodeZombieLog([{ applyStep: 0, changes }]),
            },
            terrain,
            width,
            height,
        );
        const crowd = new ZombieCrowd(told);
        const runTo = new Set<number>();
        let mostAtOnce = 0;
        for (let step = 0; step < 1800; step++) {
            crowd.step();
            let atOnce = 0;
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING || crowd.target[zombie] < 0) continue;
                runTo.add(crowd.target[zombie]);
                atOnce++;
            }
            mostAtOnce = Math.max(mostAtOnce, atOnce);
        }
        expect(runTo.size).toBeGreaterThanOrEqual(10);
        // More than the share of a single avatar (40) at once.
        expect(mostAtOnce).toBeGreaterThan(120);
    });

    it("tramples a band over every tile it ran over", () => {
        const told = horde({ count: 400 });
        const crowd = new ZombieCrowd(told);
        crowd.advanceTo(START + told.durationMs);
        const trampled = crowd.takeTrample();
        expect(trampled.length).toBeGreaterThan(50);
        const rows = new Set(trampled.filter((tile) => tile.passes > 1).map((tile) => tile.tileY));
        expect(rows.size).toBeGreaterThan(15);
        expect(crowd.takeTrample()).toEqual([]);
    });

    it("is the crowd it was: the same number after the same steps, with walls, water and an avatar", () => {
        const width = 160;
        const height = 100;
        const terrain = zombieTerrainOf(
            width,
            height,
            (x, y) => (Math.abs(x - 80) < 6 && (y < 40 || y > 50) ? 50 : 0),
            undefined,
            box(30, 20, 50, 40, 4),
        );
        const told = horde(
            {
                count: 400,
                heading: 250,
                ...zombieDirection(250),
                avatars: encodeZombieLog([{ applyStep: 20, changes: [{ slot: 0, tile: tileAt(640, 480, width) }] }]),
            },
            terrain,
            width,
            height,
        );
        const crowd = new ZombieCrowd(told);
        for (let step = 0; step < 600; step++) crowd.step();
        expect(crowd.checksum()).toBe(REFERENCE_CHECKSUM);
    });

    it("steps with nothing but what every engine computes the same", () => {
        const source = readFileSync(new URL("../src/Catastrophe/ZombieCrowd.ts", import.meta.url), "utf8");
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
        expect(meadow.trample(9, 9, 10)).toBeUndefined();
        meadow.set(1, 1, 0.4, 0.6);
        meadow.holdGrass(1, 1, 0.1);
        expect(meadow.grassAt(1, 1)).toBeCloseTo(0.1, 5);
        meadow.holdGrass(1, 1, 0.5);
        expect(meadow.grassAt(1, 1)).toBeCloseTo(0.1, 5);
    });
});

describe("the shove of a horde on an avatar", () => {
    it("pushes an avatar standing in the way of a dense horde, at a human pace at most, and leaves it alone out of it", () => {
        // A horde running east over an avatar standing still in the middle of its way.
        const crowd = new ZombieCrowd(horde({ count: 600 }));
        const avatar = { x: 60 * TERRAIN_CELL, y: 40 * TERRAIN_CELL };
        let shoved = 0;
        let fastest = 0;
        for (let step = 0; step < 300; step++) {
            crowd.step();
            const shove = crowd.shoveAt(avatar.x, avatar.y);
            const speed = Math.sqrt(shove.x * shove.x + shove.y * shove.y);
            fastest = Math.max(fastest, speed);
            if (speed > 0) {
                shoved++;
                // Pushed the way the horde runs, as a whole.
                avatar.x += shove.x * 0.1;
                avatar.y += shove.y * 0.1;
            }
        }
        expect(shoved).toBeGreaterThan(5);
        expect(avatar.x).toBeGreaterThan(60 * TERRAIN_CELL);
        expect(fastest).toBeLessThanOrEqual(ZOMBIE_SHOVE_MOST_M_S * 29.3);
        expect(crowd.shoveAt(-500, -500)).toEqual({ x: 0, y: 0 });
    });
});
