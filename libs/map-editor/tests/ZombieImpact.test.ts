import { describe, expect, it } from "vitest";
import { ZOMBIE_DYING, ZOMBIE_GONE, ZOMBIE_THROWN, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    decodeZombieLog,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieDirection,
    ZombieLogWriter,
    ZOMBIE_PX_PER_METRE,
    zombieTerrainOf,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { zombieImpactFall, zombieImpactOf, zombieImpactRadii } from "../src/Catastrophe/ZombieImpact";
import { METEOR_FALL_MS } from "../src/Catastrophe/Meteor";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { TERRAIN_CELL, TILE_PX } from "../src/types";

const START = 1_800_000_000_000;
/** The checksum of the reference crowd with comets (see its test): set once, changed only with the model. */
const IMPACT_REFERENCE_CHECKSUM = 4035092318;

/** A horde over a map of `widthCells` x `heightCells` cells, over that ground, at the speed of reality. */
function horde(overrides: Partial<ZombieHorde> = {}, terrain?: Uint8Array, widthCells = 120, heightCells = 80) {
    const heading = overrides.heading ?? 90;
    const told: ZombieHorde = {
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
    return told;
}

/** Where the walking zombies of a crowd are thickest: their middle. */
function middleOf(crowd: ZombieCrowd): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (let zombie = 0; zombie < crowd.count; zombie++) {
        if (crowd.state[zombie] !== ZOMBIE_WALKING) continue;
        sx += crowd.x[zombie];
        sy += crowd.y[zombie];
    }
    return { x: Math.round(sx / crowd.walking), y: Math.round(sy / crowd.walking) };
}

describe("the log of a horde with comets", () => {
    it("tells the impacts with the darts, the grenades and the avatars, and reads them back the same", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 25, changes: [{ slot: 0, tile: 1234 }] },
            { applyStep: 40, changes: [], impacts: [{ x: 1900, y: 640, radiusTiles: 8, burning: true }] },
            {
                applyStep: 41,
                changes: [{ slot: 1, tile: 7 }],
                grenades: [{ fromX: 10, fromY: 20, toX: 300, toY: 400 }],
                darts: [{ fromX: 100, fromY: 200, toX: 90, toY: 600, shotStep: 30, stride: 1 }],
                impacts: [
                    { x: 0, y: 0, radiusTiles: 1, burning: false },
                    { x: 20_000, y: 16_000, radiusTiles: 4, burning: true },
                ],
            },
            {
                applyStep: 9000,
                changes: [],
                darts: [{ fromX: 5, fromY: 6, toX: 7, toY: 8, shotStep: 8990, stride: 2 }],
            },
        ];
        expect(decodeZombieLog(encodeZombieLog(log))).toEqual(log);
        // Written out as it grows, as the server does: the same text.
        const writer = new ZombieLogWriter();
        for (const entry of log) writer.append([entry]);
        expect(writer.text).toBe(encodeZombieLog(log));
    });

    it("tells an entry without impacts in as many bytes as before, and an impact in a dozen", () => {
        const dart = {
            applyStep: 9000,
            changes: [],
            darts: [{ fromX: 5, fromY: 6, toX: 7, toY: 8, shotStep: 8990, stride: 2 }],
        };
        // Step (2 bytes), changes, grenades, darts (1 each), the dart (6): as many as before there were impacts.
        expect(atob(encodeZombieLog([dart])).length).toBe(11);
        expect(atob(encodeZombieLog([{ applyStep: 25, changes: [] }])).length).toBe(4);
        const impact = { applyStep: 9000, changes: [], impacts: [zombieImpactOf(7680.4, 5119.6, 4, false)] };
        expect(atob(encodeZombieLog([impact])).length).toBe(11);
    });

    it("keeps an impact within what a meteor may be, in whole pixels", () => {
        expect(zombieImpactOf(12.6, 7.4, 30, true)).toEqual({ x: 13, y: 7, radiusTiles: 8, burning: true });
        expect(zombieImpactOf(0, 0, 0, false).radiusTiles).toBe(4);
        expect(zombieImpactRadii({ radiusTiles: 4 })).toEqual({ lethal: 4 * TILE_PX, blast: 12 * TILE_PX });
    });
});

describe("when a meteor lands in a horde", () => {
    it("falls about 2.5 s, to a step after the log is complete to, and lands when that step comes", () => {
        // The log read 500 ms ago, complete to 2.5 s after it.
        const told = { anchorStep: 0, anchorAt: START, msPerStep: 100, safeStep: 29 };
        expect(zombieImpactFall(told, START + 1000)).toEqual({ applyStep: 35, fallMs: 2500 });
        // Promised further: it falls until the step after.
        expect(zombieImpactFall({ ...told, safeStep: 40 }, START + 1000)).toEqual({ applyStep: 41, fallMs: 3100 });
        // A map ten times faster: as long, in more steps; a clock anchored between two steps lands on the next.
        const sped = { anchorStep: 100.5, anchorAt: START, msPerStep: 10, safeStep: 300 };
        expect(zombieImpactFall(sped, START)).toEqual({ applyStep: 351, fallMs: 2505 });
        expect(zombieImpactFall(sped, START)?.fallMs).toBeGreaterThan(METEOR_FALL_MS);
        // The map slowed down from ten times: the steps promised then last ten times longer. Not into the horde.
        expect(zombieImpactFall({ anchorStep: 100, anchorAt: START, msPerStep: 100, safeStep: 350 }, START)).toBe(
            undefined,
        );
        expect(zombieImpactFall({ ...told, safeStep: 44 }, START + 1000)).toEqual({ applyStep: 45, fallMs: 3500 });
    });

    it.each([
        { what: "a burning meteor throws them burning", burning: true, state: ZOMBIE_DYING },
        { what: "a comet throws them without fire", burning: false, state: ZOMBIE_THROWN },
    ])("kills the zombies in its crater: $what; shoves those around, and is no grenade", ({ burning, state }) => {
        const told = horde({ count: 400 });
        const plain = new ZombieCrowd(told);
        plain.advanceTo(START + 20_000);
        const at = middleOf(plain);
        const impact = zombieImpactOf(at.x, at.y, 6, burning);
        const { lethal, blast } = zombieImpactRadii(impact);
        const near = (crowd: ZombieCrowd, zombie: number) =>
            Math.sqrt((crowd.x[zombie] - at.x) ** 2 + (crowd.y[zombie] - at.y) ** 2);
        let inCrater = 0;
        const ring: number[] = [];
        for (let zombie = 0; zombie < plain.count; zombie++) {
            if (plain.state[zombie] !== ZOMBIE_WALKING) continue;
            const d = near(plain, zombie);
            if (d < lethal) inCrater++;
            else if (d < blast) ring.push(zombie);
        }
        expect(inCrater).toBeGreaterThan(5);
        expect(ring.length).toBeGreaterThan(5);
        const log = encodeZombieLog([{ applyStep: plain.steps, changes: [], impacts: [impact] }]);
        const struck = new ZombieCrowd({ ...told, avatars: log });
        struck.advanceTo(START + 20_000);
        expect(struck.checksum()).toBe(plain.checksum());
        plain.step();
        struck.step();
        expect(struck.killedByImpacts).toBe(inCrater);
        expect(struck.dying).toBe(inCrater);
        // Thrown up higher than by a grenade: half as fast again.
        let thrown = 0;
        let highest = 0;
        for (let zombie = 0; zombie < struck.count; zombie++) {
            if (struck.state[zombie] === state && struck.z[zombie] > 0) thrown++;
            highest = Math.max(highest, struck.vz[zombie]);
        }
        expect(thrown).toBe(inCrater);
        expect(highest).toBeGreaterThan(9 * ZOMBIE_PX_PER_METRE);
        // Those around are pushed away from it, further than they would have gone.
        let pushed = 0;
        for (const zombie of ring) {
            if (struck.state[zombie] === ZOMBIE_WALKING && near(struck, zombie) > near(plain, zombie)) pushed++;
        }
        expect(pushed).toBeGreaterThan(ring.length * 0.8);
        // Its burst is the meteor's, its fire the server's: no blast of a grenade.
        expect(struck.takeExplosions()).toEqual([]);
        // Burnt within the time of a grenade, then gone.
        struck.advanceTo(START + 25_000);
        expect(struck.dying).toBe(0);
        let gone = 0;
        for (let zombie = 0; zombie < struck.count; zombie++) if (struck.state[zombie] === ZOMBIE_GONE) gone++;
        expect(gone).toBeGreaterThanOrEqual(inCrater);
    });

    it("kills the same zombies wherever it is stepped: told late, told bit by bit, or to one who joins after", () => {
        const told = horde({ count: 400 });
        const plain = new ZombieCrowd(told);
        plain.advanceTo(START + 20_000);
        const at = middleOf(plain);
        // As the server tells them, in that order: each entry at the second it is told, after the step the log is
        // then complete to (second * 10 + 24): the avatars 2.5 s ahead, a comet as it is launched (2.5 s ahead), a
        // grenade 4 s ahead, so that a comet told after a grenade may land before it.
        const tellings: { second: number; entry: ZombieLogEntry }[] = [
            {
                second: 0,
                entry: {
                    applyStep: 30,
                    changes: [{ slot: 0, tile: Math.floor(600 / TILE_PX) * 60 + Math.floor(1500 / TILE_PX) }],
                },
            },
            { second: 18, entry: { applyStep: 205, changes: [], impacts: [zombieImpactOf(at.x, at.y, 6, false)] } },
            {
                second: 19,
                entry: {
                    applyStep: 230,
                    changes: [],
                    grenades: [{ fromX: at.x + 300, fromY: at.y, toX: at.x - 100, toY: at.y + 50 }],
                },
            },
            {
                second: 20,
                entry: { applyStep: 225, changes: [], impacts: [zombieImpactOf(at.x - 200, at.y - 100, 2, true)] },
            },
            { second: 26, entry: { applyStep: 285, changes: [{ slot: 0, tile: -1 }] } },
        ];
        const entries = tellings.map(({ entry }) => entry);
        const log = encodeZombieLog(entries);
        const whole = new ZombieCrowd({ ...told, avatars: log });
        whole.advanceTo(START + 40_000);
        expect(whole.killedByImpacts).toBeGreaterThan(10);
        // A browser told each second the entries of that second, the log complete to 2.5 s ahead.
        const bitByBit = new ZombieCrowd({ ...told, avatars: "", safeStep: -1 });
        const writer = new ZombieLogWriter();
        for (let second = 0; second < 40; second++) {
            const safe = second * 10 + 24;
            const now = tellings.filter((one) => one.second === second).map(({ entry }) => entry);
            for (const entry of now) expect(entry.applyStep).toBeGreaterThan(safe);
            writer.append(now);
            bitByBit.setLog(writer.text, safe);
            for (let image = 1; image <= 6; image++) bitByBit.advanceTo(START + second * 1000 + image * 166, 3);
        }
        bitByBit.advanceTo(START + 40_000);
        expect(bitByBit.checksum()).toBe(whole.checksum());
        expect(bitByBit.killedByImpacts).toBe(whole.killedByImpacts);
        // One who joins after the impacts: the whole log, the crowd stepped from the beginning.
        const joined = new ZombieCrowd({ ...told, avatars: log });
        joined.advanceTo(START + 40_000);
        expect(joined.checksum()).toBe(whole.checksum());
        // Without them, another crowd.
        const none = new ZombieCrowd({ ...told, avatars: encodeZombieLog([entries[0], entries[2], entries[4]]) });
        none.advanceTo(START + 40_000);
        expect(none.checksum()).not.toBe(whole.checksum());
    });

    it("is the crowd it was: the same number after the same steps, with walls, water, an avatar and comets", () => {
        const width = 160;
        const height = 100;
        const east = new Set<string>();
        const south = new Set<string>();
        for (let y = 20; y < 40; y++) {
            east.add(cellKey(29, y));
            if (y < 28 || y >= 32) east.add(cellKey(49, y));
        }
        for (let x = 30; x < 50; x++) {
            south.add(cellKey(x, 19));
            south.add(cellKey(x, 39));
        }
        const terrain = zombieTerrainOf(
            width,
            height,
            (x, y) => (Math.abs(x - 80) < 6 && (y < 40 || y > 50) ? 50 : 0),
            undefined,
            { east, south },
        );
        const told = horde(
            {
                count: 400,
                heading: 250,
                ...zombieDirection(250),
                avatars: encodeZombieLog([
                    { applyStep: 20, changes: [{ slot: 0, tile: Math.floor(480 / TILE_PX) * 80 + 640 / TILE_PX }] },
                    { applyStep: 150, changes: [], impacts: [zombieImpactOf(1900, 700, 8, false)] },
                    { applyStep: 260, changes: [], impacts: [zombieImpactOf(1400, 800, 3, true)] },
                    {
                        applyStep: 330,
                        changes: [],
                        impacts: [zombieImpactOf(1000, 760, 5, false), zombieImpactOf(800, 700, 1, true)],
                    },
                ]),
            },
            terrain,
            width,
            height,
        );
        const crowd = new ZombieCrowd(told);
        for (let step = 0; step < 600; step++) crowd.step();
        expect(crowd.killedByImpacts).toBeGreaterThan(10);
        expect(crowd.checksum()).toBe(IMPACT_REFERENCE_CHECKSUM);
    });
});
