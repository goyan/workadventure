import { describe, expect, it } from "vitest";
import { ZOMBIE_DYING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    decodeZombieLog,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieDirection,
    ZombieLogWriter,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
/** The checksum of the reference crowd that runs into a fire (see its test): changed only with the model. */
const FIRE_REFERENCE_CHECKSUM = 4106216541;
const TILES_WIDE = (120 * TERRAIN_CELL) / TILE_PX;

function horde(log: ZombieLogEntry[], overrides: Partial<ZombieHorde> = {}): ZombieHorde {
    return {
        id: 1,
        seed: 4321,
        count: 400,
        durationMs: 2 * 60_000,
        heading: 90,
        startedAt: START,
        anchorStep: 0,
        anchorAt: START,
        msPerStep: 100,
        ...zombieDirection(90),
        anchorX: (120 * TERRAIN_CELL) / 2,
        anchorY: (80 * TERRAIN_CELL) / 2,
        widthCells: 120,
        heightCells: 80,
        terrain: encodeZombieTerrain(new Uint8Array(120 * 80)),
        avatars: encodeZombieLog(log),
        safeStep: 1_000_000,
        ...overrides,
    };
}

/** The tiles of a band across the way of the horde, columns `from` to `to` (tiles), every row. */
function band(from: number, to: number): number[] {
    const tiles: number[] = [];
    for (let tileY = 0; tileY < 40; tileY++)
        for (let tileX = from; tileX <= to; tileX++) tiles.push(tileY * TILES_WIDE + tileX);
    return tiles;
}

describe("the fire in the log of a horde", () => {
    it("tells the tiles that take fire and go out, with the rest of an entry, and reads them back the same", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 25, changes: [{ slot: 0, tile: 1234 }], fireOn: [3, 4, 5, 900, 38_399] },
            {
                applyStep: 40,
                changes: [],
                darts: [{ fromX: 100, fromY: 200, toX: 90, toY: 600, shotStep: 30, stride: 1 }],
                impacts: [{ x: 1900, y: 640, radiusTiles: 8, burning: true }],
                fireOff: [4, 900],
            },
            { applyStep: 41, changes: [], fireOn: [7], fireOff: [3] },
        ];
        expect(decodeZombieLog(encodeZombieLog(log))).toEqual(log);
        const writer = new ZombieLogWriter();
        for (const entry of log) writer.append([entry]);
        expect(writer.text).toBe(encodeZombieLog(log));
        // An entry without fire: as many bytes as before; a front of fire of 40 tiles side by side, a byte each.
        expect(atob(encodeZombieLog([{ applyStep: 25, changes: [] }])).length).toBe(4);
        expect(atob(encodeZombieLog([{ applyStep: 25, changes: [], fireOn: band(30, 30) }])).length).toBe(4 + 2 + 40);
    });
});

describe("a horde that runs into a fire", () => {
    it("burns where it stands, unthrown, those that walk into the tiles on fire, and no more once it went out", () => {
        // A band of fire 2 tiles wide across its way, from 20 s to 40 s.
        const fire = band(30, 31);
        const log: ZombieLogEntry[] = [
            { applyStep: 200, changes: [], fireOn: fire },
            { applyStep: 400, changes: [], fireOff: fire },
        ];
        const crowd = new ZombieCrowd(horde(log));
        crowd.advanceTo(START + 19_900);
        expect(crowd.killedByFire).toBe(0);
        let burntIn = 0;
        let flying = 0;
        for (let step = 0; step < 200; step++) {
            crowd.step();
            for (let zombie = 0; zombie < crowd.count; zombie++) {
                if (crowd.state[zombie] !== ZOMBIE_DYING) continue;
                if (crowd.z[zombie] > 0 || crowd.vx[zombie] !== 0) flying++;
                const tileX = Math.floor(crowd.x[zombie] / TILE_PX);
                if (tileX >= 30 && tileX <= 31) burntIn++;
            }
        }
        // Measured: 176 of the 400 burnt, each where it stood in the band, none thrown.
        expect(crowd.killedByFire).toBeGreaterThan(100);
        expect(flying).toBe(0);
        expect(burntIn).toBeGreaterThan(0);
        // Once it went out, nobody burns any more.
        const burnt = crowd.killedByFire;
        crowd.advanceTo(START + 60_000);
        expect(crowd.killedByFire).toBe(burnt);
    });

    it("burns the same zombies told the fire bit by bit, as a browser hears it, as told it whole", () => {
        const fire = band(25, 27);
        const log: ZombieLogEntry[] = [
            { applyStep: 150, changes: [], fireOn: fire.slice(0, 60) },
            { applyStep: 180, changes: [], fireOn: fire.slice(60) },
            { applyStep: 300, changes: [], fireOff: fire.slice(0, 30) },
            { applyStep: 420, changes: [], fireOff: fire.slice(30) },
        ];
        const whole = new ZombieCrowd(horde(log));
        whole.advanceTo(START + 50_000);
        expect(whole.killedByFire).toBeGreaterThan(20);
        // Each entry told a second before its step, the log complete to 2.5 s ahead each second.
        const bitByBit = new ZombieCrowd(horde([], { safeStep: -1 }));
        const writer = new ZombieLogWriter();
        for (let second = 0; second < 50; second++) {
            const safe = second * 10 + 24;
            writer.append(log.slice(writer.entries.length).filter((entry) => entry.applyStep <= safe + 10));
            bitByBit.setLog(writer.text, safe);
            for (let image = 1; image <= 6; image++) bitByBit.advanceTo(START + second * 1000 + image * 166, 3);
        }
        bitByBit.advanceTo(START + 50_000);
        expect(bitByBit.checksum()).toBe(whole.checksum());
    });

    it("is the crowd it was: the same number after the same steps, with an avatar and a fire", () => {
        const told = horde([
            { applyStep: 20, changes: [{ slot: 0, tile: 20 * TILES_WIDE + 50 }] },
            { applyStep: 150, changes: [], fireOn: band(28, 29) },
            { applyStep: 330, changes: [], fireOff: band(28, 29), fireOn: band(40, 41) },
        ]);
        const crowd = new ZombieCrowd(told);
        for (let step = 0; step < 600; step++) crowd.step();
        expect(crowd.killedByFire).toBeGreaterThan(10);
        expect(crowd.checksum()).toBe(FIRE_REFERENCE_CHECKSUM);
    });
});
