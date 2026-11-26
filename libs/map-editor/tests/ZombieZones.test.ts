import { describe, expect, it } from "vitest";
import { ZOMBIE_GONE, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    decodeZombieLog,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieDirection,
    ZombieLogWriter,
    zombieTerrainOf,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { zombieForbiddenTilesOf } from "../src/Catastrophe/ZombieZones";
import { cellKey } from "../src/Terrain/TerrainGrid";
import type { WAMFileFormat } from "../src/types";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
const WIDTH = 160;
const HEIGHT = 100;
const TILES_WIDE = (WIDTH * TERRAIN_CELL) / TILE_PX;
/** The checksum of the reference crowd round a desk (see its test): changed only with the model. */
const DESK_REFERENCE_CHECKSUM = 3444349480;
/** How fast a zombie stands still: under 0.3 m/s (map px/s). */
const STILL = (0.3 * TILE_PX) / 1.1;

/** A building (cells 70 to 100, rows 10 to 30), a door of two tiles in its south wall (cells 83 to 86). */
function building(): Uint8Array {
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
    return zombieTerrainOf(WIDTH, HEIGHT, () => 0, undefined, { east, south });
}

function horde(log: ZombieLogEntry[], terrain = building(), overrides: Partial<ZombieHorde> = {}): ZombieHorde {
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
        // Its middle south of the building: it comes in on the west edge.
        anchorX: (WIDTH * TERRAIN_CELL) / 2,
        anchorY: 80 * TERRAIN_CELL,
        widthCells: WIDTH,
        heightCells: HEIGHT,
        terrain: encodeZombieTerrain(terrain),
        avatars: encodeZombieLog(log),
        safeStep: 1_000_000,
        ...overrides,
    };
}

/** The tiles of a rectangle of tiles, row by row. */
function tiles(fromX: number, fromY: number, toX: number, toY: number): number[] {
    const out: number[] = [];
    for (let tileY = fromY; tileY <= toY; tileY++)
        for (let tileX = fromX; tileX <= toX; tileX++) out.push(tileY * TILES_WIDE + tileX);
    return out;
}

/** A desk in the building (tiles 38 to 44, rows 7 to 11), its avatar at it (tile 41, 9). */
const DESK = tiles(38, 7, 44, 11);
const AT_DESK = 9 * TILES_WIDE + 41;

/** The zombies walking in a forbidden cell now. */
function walkingIn(crowd: ZombieCrowd): number {
    let inside = 0;
    for (let zombie = 0; zombie < crowd.count; zombie++) {
        if (crowd.state[zombie] === ZOMBIE_WALKING && crowd.forbiddenAt(crowd.x[zombie], crowd.y[zombie])) inside++;
    }
    return inside;
}

describe("the forbidden tiles in the log of a horde", () => {
    it("tells the tiles kept out of and let go, with the rest of an entry, and reads them back the same", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 0, changes: [], forbidOn: [3, 4, 5, 900, 38_399] },
            {
                applyStep: 40,
                changes: [{ slot: 0, tile: 1234 }],
                darts: [{ fromX: 100, fromY: 200, toX: 90, toY: 600, shotStep: 30, stride: 1 }],
                impacts: [{ x: 1900, y: 640, radiusTiles: 8, burning: true }],
                fireOn: [7],
                forbidOff: [4, 900],
            },
            { applyStep: 41, changes: [], forbidOn: [7], forbidOff: [3] },
        ];
        expect(decodeZombieLog(encodeZombieLog(log))).toEqual(log);
        const writer = new ZombieLogWriter();
        for (const entry of log) writer.append([entry]);
        expect(writer.text).toBe(encodeZombieLog(log));
        // An entry without them: as many bytes as before; fifteen darts still tell their count in a byte.
        expect(atob(encodeZombieLog([{ applyStep: 25, changes: [] }])).length).toBe(4);
        const darts = Array.from({ length: 15 }, () => ({
            fromX: 1,
            fromY: 1,
            toX: 2,
            toY: 2,
            shotStep: 20,
            stride: 1,
        }));
        expect(decodeZombieLog(encodeZombieLog([{ applyStep: 25, changes: [], darts }]))[0].darts).toHaveLength(15);
    });
});

describe("the tiles a horde keeps out of", () => {
    /** A map: a desk, a meeting room locked or not, a room of a raised floor, and the doors of the "Map" tool. */
    function wam(): Pick<WAMFileFormat, "areas" | "entities"> {
        const door = (name: string, x: number, y: number) => ({
            x,
            y,
            prefabRef: { collectionName: "Carte Portes", id: `Carte Portes:${name}:Default:Down` },
            properties: [],
        });
        return {
            areas: [
                {
                    id: "desk",
                    name: "desk",
                    visible: true,
                    // Tiles 2 to 4, rows 3 to 4.
                    x: 64,
                    y: 96,
                    width: 96,
                    height: 64,
                    properties: [
                        {
                            id: "p",
                            type: "personalAreaPropertyData",
                            accessClaimMode: "dynamic",
                            allowedTags: [],
                            ownerId: null,
                        },
                    ],
                },
                {
                    id: "meeting",
                    name: "meeting",
                    visible: true,
                    // Tiles 10 to 11, row 3: half tiles at its edges are left out (their middle is out).
                    x: 312,
                    y: 96,
                    width: 80,
                    height: 32,
                    properties: [{ id: "lock", type: "lockableAreaPropertyData" }],
                },
                {
                    id: "upstairs",
                    name: "upstairs",
                    visible: true,
                    x: 0,
                    y: 0,
                    width: 64,
                    height: 64,
                    elevation: 64,
                    properties: [
                        {
                            id: "p",
                            type: "personalAreaPropertyData",
                            accessClaimMode: "dynamic",
                            allowedTags: [],
                            ownerId: null,
                        },
                    ],
                },
            ],
            entities: {
                // A horizontal door on the row above the desk (tiles 3 and 4 of row 2): its doors.
                g: door("porte-h-gris-g", 96, 64),
                d: door("porte-h-gris-d", 128, 64),
                // The upper leaf of a vertical door on the line x = 12 (tiles 11 and 12), row 3: across the east edge
                // of the meeting room.
                v: door("porte-v-gris-haut", 352, 76),
                // A door of another room, far off.
                far: door("porte-h-gris-g", 640, 640),
            },
        } as unknown as Pick<WAMFileFormat, "areas" | "entities">;
    }
    const at = (tileX: number, tileY: number) => tileY * 40 + tileX;

    it("keeps out of the desks and their doors, and of the locked areas only while locked", () => {
        const desk = [at(3, 2), at(4, 2), at(2, 3), at(3, 3), at(4, 3), at(2, 4), at(3, 4), at(4, 4)];
        expect(zombieForbiddenTilesOf(wam(), () => false, 40, 30)).toEqual(desk);
        const meeting = [at(10, 3), at(11, 3), at(12, 3)];
        expect(zombieForbiddenTilesOf(wam(), (areaId) => areaId === "meeting", 40, 30)).toEqual(
            [...desk, ...meeting].sort((a, b) => a - b),
        );
    });

    it("keeps out of nothing on a map without areas", () => {
        expect(zombieForbiddenTilesOf(undefined, () => true, 40, 30)).toEqual([]);
        expect(zombieForbiddenTilesOf({ areas: [], entities: {} }, () => true, 40, 30)).toEqual([]);
    });
});

describe("a horde round the desks", () => {
    it("never goes into a desk: it packs at its edge round the avatar sitting there, then runs out in time", () => {
        const crowd = new ZombieCrowd(horde([{ applyStep: 0, changes: [{ slot: 0, tile: AT_DESK }], forbidOn: DESK }]));
        let mostIn = 0;
        for (let step = 0; step < 1500; step++) {
            crowd.step();
            mostIn = Math.max(mostIn, walkingIn(crowd));
        }
        expect(mostIn).toBe(0);
        // At 150 s: every one still on the map, most of them round the desk (within 12 tiles of the avatar).
        let near = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            const dx = crowd.x[zombie] - 41.5 * TILE_PX;
            const dy = crowd.y[zombie] - 9.5 * TILE_PX;
            if (dx * dx + dy * dy < (12 * TILE_PX) ** 2) near++;
        }
        expect(crowd.walking).toBe(600);
        expect(near).toBeGreaterThan(400);
        // Its end as without the desk (66 of the 600 left on the map then): measured 62.
        crowd.advanceTo(START + 4 * 60_000 - 150);
        expect(crowd.walking).toBeLessThan(80);
    });

    it("walks out of an area made round it, through the crowd at its edge, without standing still", () => {
        // An avatar on open ground; at 60 s an area of 10 x 10 tiles is made round it, with some 300 zombies in it.
        const crowd = new ZombieCrowd(
            horde(
                [
                    { applyStep: 0, changes: [{ slot: 0, tile: 25 * TILES_WIDE + 40 }] },
                    { applyStep: 600, changes: [], forbidOn: tiles(35, 20, 44, 29) },
                ],
                new Uint8Array(WIDTH * HEIGHT),
            ),
        );
        crowd.advanceTo(START + 60_000);
        expect(walkingIn(crowd)).toBeGreaterThan(250);
        let stillIn = 0;
        let outAfter = -1;
        for (let step = 0; step < 150; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_WALKING || !crowd.forbiddenAt(crowd.x[zombie], crowd.y[zombie]))
                    continue;
                if (crowd.vx[zombie] ** 2 + crowd.vy[zombie] ** 2 < STILL * STILL) stillIn++;
            }
            if (outAfter < 0 && walkingIn(crowd) === 0) outAfter = step;
        }
        // Measured: all out in 4.9 s, 1598 still zombie-steps of some 300 zombies in it.
        expect(outAfter).toBeGreaterThan(0);
        expect(outAfter).toBeLessThan(80);
        expect(stillIn).toBeLessThan(3000);
        // And none goes back in.
        for (let step = 0; step < 300; step++) {
            crowd.step();
            expect(walkingIn(crowd)).toBe(0);
        }
    });

    it("never passes the locked door of a building: it packs before it, round the avatar inside", () => {
        // The building and the tiles before its door, as a locked area and its door.
        const crowd = new ZombieCrowd(
            horde([{ applyStep: 0, changes: [{ slot: 0, tile: AT_DESK }], forbidOn: tiles(35, 5, 49, 15) }]),
        );
        let inside = 0;
        for (let step = 0; step < 1500; step++) {
            crowd.step();
            inside = Math.max(inside, walkingIn(crowd));
        }
        expect(inside).toBe(0);
        // Packed before the door (tile 42, 15), not gone their way: measured 209 within 6 tiles of it.
        let near = 0;
        for (let zombie = 0; zombie < crowd.count; zombie++) {
            if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
            const dx = crowd.x[zombie] - 42.5 * TILE_PX;
            const dy = crowd.y[zombie] - 15.5 * TILE_PX;
            if (dx * dx + dy * dy < (6 * TILE_PX) ** 2) near++;
        }
        expect(near).toBeGreaterThan(150);
        crowd.advanceTo(START + 4 * 60_000);
        expect([...crowd.state].every((state) => state === ZOMBIE_GONE)).toBe(true);
    });

    it("is the same crowd told the desks bit by bit, as a browser hears them, as told them whole", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 0, changes: [{ slot: 0, tile: AT_DESK }], forbidOn: DESK.slice(0, 20) },
            { applyStep: 25, changes: [], forbidOn: DESK.slice(20) },
            { applyStep: 300, changes: [], forbidOff: DESK.slice(0, 10) },
            { applyStep: 420, changes: [], forbidOn: DESK.slice(0, 10) },
        ];
        const whole = new ZombieCrowd(horde(log));
        whole.advanceTo(START + 50_000);
        const bitByBit = new ZombieCrowd(horde(log.slice(0, 1), building(), { safeStep: 24 }));
        const writer = ZombieLogWriter.of(encodeZombieLog(log.slice(0, 1)), log.slice(0, 1));
        for (let second = 0; second < 50; second++) {
            const safe = second * 10 + 24;
            writer.append(log.slice(writer.entries.length).filter((entry) => entry.applyStep <= safe + 10));
            bitByBit.setLog(writer.text, safe);
            for (let image = 1; image <= 6; image++) bitByBit.advanceTo(START + second * 1000 + image * 166, 3);
        }
        bitByBit.advanceTo(START + 50_000);
        expect(bitByBit.checksum()).toBe(whole.checksum());
    });

    it("is the crowd it was: the same number after the same steps, round a desk", () => {
        const crowd = new ZombieCrowd(
            horde([
                { applyStep: 0, changes: [{ slot: 0, tile: AT_DESK }], forbidOn: DESK },
                { applyStep: 300, changes: [], forbidOff: DESK.slice(0, 7) },
            ]),
        );
        for (let step = 0; step < 600; step++) crowd.step();
        expect(crowd.checksum()).toBe(DESK_REFERENCE_CHECKSUM);
    });
});
