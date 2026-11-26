import { describe, expect, it } from "vitest";
import { ZOMBIE_GONE, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import { encodeZombieLog, encodeZombieTerrain, zombieDirection, zombieTerrainOf } from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
const WIDTH = 160;
const HEIGHT = 100;
const TILES_WIDE = (WIDTH * TERRAIN_CELL) / TILE_PX;

/**
 * A map of 160 x 100 cells: a river across it (rows 50 to 59), a narrow bridge over it (cells 40 to 43, two tiles)
 * and a wide one (cells 110 to 125); north of it a building (cells 70 to 100, rows 10 to 30) with a door of two tiles
 * in its south wall.
 */
function riverAndBuilding(narrow = 4): Uint8Array {
    const east = new Set<string>();
    const south = new Set<string>();
    for (let y = 10; y < 30; y++) {
        east.add(cellKey(69, y));
        east.add(cellKey(99, y));
    }
    for (let x = 70; x < 100; x++) {
        south.add(cellKey(x, 9));
        if (x < 83 || x >= 87) south.add(cellKey(x, 29));
    }
    const river = (x: number, y: number) =>
        y >= 50 && y < 60 && !(x >= 40 && x < 40 + narrow) && !(x >= 110 && x < 126);
    return zombieTerrainOf(WIDTH, HEIGHT, (x, y) => (river(x, y) ? 50 : 0), undefined, { east, south });
}

function horde(log: ZombieLogEntry[], overrides: Partial<ZombieHorde> = {}, narrow = 4): ZombieHorde {
    return {
        id: 1,
        seed: 777,
        count: 600,
        durationMs: 4 * 60_000,
        heading: 90,
        startedAt: START,
        anchorStep: 0,
        anchorAt: START,
        msPerStep: 100,
        ...zombieDirection(90),
        // Its middle south of the river: it comes in on the south bank.
        anchorX: (WIDTH * TERRAIN_CELL) / 2,
        anchorY: 80 * TERRAIN_CELL,
        widthCells: WIDTH,
        heightCells: HEIGHT,
        terrain: encodeZombieTerrain(riverAndBuilding(narrow)),
        avatars: encodeZombieLog(log),
        safeStep: 1_000_000,
        ...overrides,
    };
}

const tileOf = (x: number, y: number): number => Math.floor(y / TILE_PX) * TILES_WIDE + Math.floor(x / TILE_PX);

/**
 * An avatar that plays in the horde on the south bank for 40 s, then walks home: over the narrow bridge, into the
 * building by its door, to its desk (where lama went on the map of Antoine, 2026-11-26).
 */
function homeward(): ZombieLogEntry[] {
    const way: [number, number][] = [
        [30 * TERRAIN_CELL, 80 * TERRAIN_CELL],
        [42 * TERRAIN_CELL, 80 * TERRAIN_CELL],
        [42 * TERRAIN_CELL, 40 * TERRAIN_CELL],
        [85 * TERRAIN_CELL, 40 * TERRAIN_CELL],
        [85 * TERRAIN_CELL, 20 * TERRAIN_CELL],
    ];
    const log: ZombieLogEntry[] = [];
    let known = -1;
    for (let tenth = 0; tenth < 2400; tenth++) {
        let left = Math.max(0, tenth / 10 - 40) * 150;
        let at = way[way.length - 1];
        for (let leg = 0; leg + 1 < way.length; leg++) {
            const [ax, ay] = way[leg];
            const [bx, by] = way[leg + 1];
            const length = Math.abs(bx - ax) + Math.abs(by - ay);
            if (left <= length) {
                at = [ax + Math.sign(bx - ax) * left, ay + Math.sign(by - ay) * left];
                break;
            }
            left -= length;
        }
        const tile = tileOf(at[0], at[1]);
        if (tile !== known) {
            known = tile;
            log.push({ applyStep: tenth + 25, changes: [{ slot: 0, tile }] });
        }
    }
    return log;
}

/** How fast a zombie stands still: under 0.3 m/s (map px/s). */
const STILL = (0.3 * TILE_PX) / 1.1;

describe("a horde that chases the avatars", () => {
    it("follows an avatar home over a bridge, every zombie, and packs round it without giving up", () => {
        const crowd = new ZombieCrowd(horde(homeward()));
        const desk = { x: 85 * TERRAIN_CELL, y: 20 * TERRAIN_CELL };
        let mostChasing = 0;
        let mostWalking = 0;
        for (let step = 0; step < 1500; step++) {
            crowd.step();
            let chasing = 0;
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] === ZOMBIE_WALKING && crowd.target[zombie] === 0) chasing++;
            }
            mostChasing = Math.max(mostChasing, chasing);
            mostWalking = Math.max(mostWalking, crowd.walking);
        }
        // Every zombie runs to it, not forty: all six hundred at once.
        expect(mostChasing).toBe(600);
        expect(mostWalking).toBe(600);
        // At 150 s, its time not short yet: nearly all over the river, most of them round its desk (within 12 tiles),
        // none gone. Before (forty at most on an avatar, done with it within 5 tiles), one was left on the map.
        let north = 0;
        let near = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            if (crowd.y[zombie] < 50 * TERRAIN_CELL) north++;
            const dx = crowd.x[zombie] - desk.x;
            const dy = crowd.y[zombie] - desk.y;
            if (dx * dx + dy * dy < (12 * TILE_PX) ** 2) near++;
        }
        expect(crowd.walking).toBe(600);
        expect(north).toBeGreaterThan(500);
        expect(near).toBeGreaterThan(400);
        // Then it runs out in time.
        crowd.advanceTo(START + 4 * 60_000);
        let gone = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) gone++;
        expect(gone).toBe(600);
    });

    it(
        "takes another bridge when the crowd jams the nearest one, and gets over the river sooner",
        { timeout: 20_000 },
        () => {
            // A narrow bridge of one tile, the wide one further off, 1500 zombies, an avatar at its desk.
            const desk = tileOf(85 * TERRAIN_CELL, 20 * TERRAIN_CELL);
            const crowd = new ZombieCrowd(
                horde([{ applyStep: 0, changes: [{ slot: 0, tile: desk }] }], { count: 1500 }, 2),
            );
            const byWide = new Set<number>();
            let northAt130 = 0;
            for (let step = 0; step < 1300; step++) {
                crowd.step();
                for (let zombie = 0; zombie < crowd.count; zombie++) {
                    if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                    const cellY = crowd.y[zombie] / TERRAIN_CELL;
                    if (cellY >= 50 && cellY < 60 && crowd.x[zombie] / TERRAIN_CELL >= 100) byWide.add(zombie);
                }
            }
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] === ZOMBIE_WALKING && crowd.y[zombie] < 50 * TERRAIN_CELL) northAt130++;
            }
            // Measured: 148 by the wide bridge and 1062 over the river at 130 s; none by it and 922 without the crowd
            // counted in the way (CROWD_COST 0).
            expect(byWide.size).toBeGreaterThan(100);
            expect(northAt130).toBeGreaterThan(1000);
        },
    );

    it("goes its way when it cannot reach any avatar, and never stands waiting for one", () => {
        // The avatar on an island of the river (closed by water on every side).
        const terrain = zombieTerrainOf(WIDTH, HEIGHT, (x, y) =>
            Math.abs(x - 80) < 12 && Math.abs(y - 50) < 12 && !(Math.abs(x - 80) < 4 && Math.abs(y - 50) < 4) ? 50 : 0,
        );
        const island = tileOf(80 * TERRAIN_CELL, 50 * TERRAIN_CELL);
        const crowd = new ZombieCrowd({
            ...horde([{ applyStep: 0, changes: [{ slot: 0, tile: island }] }], { count: 300, durationMs: 2 * 60_000 }),
            anchorY: 50 * TERRAIN_CELL,
            terrain: encodeZombieTerrain(terrain),
        });
        let chased = false;
        let standing = 0;
        for (let step = 0; step < 900; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
                if (crowd.target[zombie] >= 0) chased = true;
                if (crowd.vx[zombie] ** 2 + crowd.vy[zombie] ** 2 < STILL * STILL) standing++;
            }
        }
        expect(chased).toBe(false);
        // Hardly ever still (the crowd at its entry, a few steps): 900 steps of 300 zombies.
        expect(standing).toBeLessThan(900 * 300 * 0.02);
        crowd.advanceTo(START + 2 * 60_000);
        let gone = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_GONE) gone++;
        expect(gone).toBe(300);
    });
});
