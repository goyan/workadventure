import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZOMBIE_SHOT, ZOMBIE_WALKING, ZombieCrowd } from "../src/Catastrophe/ZombieCrowd";
import {
    NERF_DART_RANGE_PX,
    ZOMBIE_DART_BODY_PX,
    ZOMBIE_DART_FALL_STEPS,
    ZOMBIE_DART_HISTORY_STEPS,
    ZOMBIE_DART_RECOIL_PX,
    ZOMBIE_DART_TICKS,
    zombieDartAim,
    zombieDartEnters,
    zombieDartFits,
    zombieDartReach,
    zombieDartStride,
} from "../src/Catastrophe/ZombieDart";
import type { ZombieDart } from "../src/Catastrophe/ZombieDart";
import {
    decodeZombieLog,
    encodeZombieLog,
    encodeZombieTerrain,
    zombieDirection,
    zombieTerrainOf,
} from "../src/Catastrophe/ZombieHorde";
import type { ZombieHorde, ZombieLogEntry } from "../src/Catastrophe/ZombieHorde";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { TERRAIN_CELL } from "../src/types";

const START = 1_800_000_000_000;
/** The checksum of the crowd of the reference dart test: set once, changed only with the model. */
const DART_REFERENCE_CHECKSUM = 3724858246;

/** A horde of 300 running east over an open map of 120 x 80 cells, at the speed of reality. */
function horde(overrides: Partial<ZombieHorde> = {}, terrain?: Uint8Array): ZombieHorde {
    return {
        id: 1,
        seed: 12345,
        count: 300,
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
        terrain: encodeZombieTerrain(terrain ?? new Uint8Array(120 * 80)),
        avatars: "",
        safeStep: 1_000_000,
        ...overrides,
    };
}

/** The crowd of `told` stepped to `steps`. */
function crowdAt(told: ZombieHorde, steps: number): ZombieCrowd {
    const crowd = new ZombieCrowd(told);
    while (crowd.steps < steps) crowd.step();
    return crowd;
}

/**
 * A walking zombie in the middle of the map (it walks on for a few seconds more) that a dart shot westwards from
 * `offset` px east of it, at the height of its body, reaches before any other: none is entered on the way to it.
 */
function clearTarget(crowd: ZombieCrowd, offset: number): number {
    for (let zombie = 0; zombie < crowd.count; zombie++) {
        const x = crowd.x[zombie];
        const y = crowd.y[zombie] - 10;
        if (crowd.state[zombie] !== ZOMBIE_WALKING || x < 500 || x > 1100) continue;
        let clear = true;
        for (let other = 0; other < crowd.count && clear; other++) {
            if (other === zombie || crowd.state[other] !== ZOMBIE_WALKING) continue;
            const at = zombieDartEnters(x + offset, y, x - 8, y, crowd.x[other], crowd.y[other]);
            if (at >= 0) clear = false;
        }
        if (clear) return zombie;
    }
    return -1;
}

/** A dart shot at `shotStep` from a point to a point, applied as the server applies it (its flight over, plus one). */
function dartEntry(dart: Omit<ZombieDart, "stride"> & { stride?: number }): ZombieLogEntry {
    const stride = dart.stride ?? 1;
    return { applyStep: dart.shotStep + ZOMBIE_DART_TICKS * stride + 1, changes: [], darts: [{ ...dart, stride }] };
}

function shotZombies(crowd: ZombieCrowd): number[] {
    const shot: number[] = [];
    for (let zombie = 0; zombie < crowd.count; zombie++) if (crowd.state[zombie] === ZOMBIE_SHOT) shot.push(zombie);
    return shot;
}

describe("a dart of the Nerf in a horde", () => {
    it("kills the zombie it reaches: drawn falling at once, killed by the log, recoiled along the dart, then gone", () => {
        const shotStep = 150;
        const plain = crowdAt(horde(), shotStep);
        const target = clearTarget(plain, 12);
        expect(target).toBeGreaterThanOrEqual(0);
        // Shot from 12 px east of it, at the height of its body, westwards: it enters its body at once.
        const fromX = Math.round(plain.x[target] + 12);
        const fromY = Math.round(plain.y[target] - 10);
        const entry = dartEntry({ fromX, fromY, toX: fromX - NERF_DART_RANGE_PX, toY: fromY, shotStep });
        const crowd = new ZombieCrowd(horde({ avatars: encodeZombieLog([entry]) }));
        while (crowd.steps < shotStep) crowd.step();
        // Seen at the step it was shot at: the dart stopped on it, while the crowd still has it walking.
        const seen = crowd.dartsSeen();
        expect(seen).toHaveLength(1);
        expect(seen[0].hit).toMatchObject({ zombie: target, step: shotStep });
        expect(seen[0].hit?.distance).toBeLessThan(12);
        expect(crowd.state[target]).toBe(ZOMBIE_WALKING);
        // The log applies it once its flight is over: that zombie, and it alone, is killed.
        while (crowd.steps <= entry.applyStep) crowd.step();
        expect(shotZombies(crowd)).toEqual([target]);
        expect(crowd.hitStep[target]).toBe(shotStep);
        // Laid where the dart met it, a little further west along the dart; not burning, not thrown up.
        expect(crowd.x[target]).toBeCloseTo((seen[0].hit?.x ?? 0) - ZOMBIE_DART_RECOIL_PX, 5);
        expect(crowd.y[target]).toBe(seen[0].hit?.y);
        expect(crowd.z[target]).toBe(0);
        // Gone ZOMBIE_DART_FALL_STEPS after it was met.
        while (crowd.steps < shotStep + ZOMBIE_DART_FALL_STEPS - 1) crowd.step();
        expect(crowd.state[target]).toBe(ZOMBIE_SHOT);
        crowd.step();
        expect(crowd.state[target]).not.toBe(ZOMBIE_SHOT);
        expect(crowd.state[target]).not.toBe(ZOMBIE_WALKING);
        expect(crowd.dying).toBe(0);
    });

    it("stops on the first zombie it reaches: the one behind lives, and a second dart passes the fallen one by", () => {
        const shotStep = 200;
        const plain = crowdAt(horde({ count: 600 }), shotStep);
        const first = clearTarget(plain, 20);
        // A zombie some 2 to 9 m west of it: the dart is shot through the first towards it, 20 px before the first.
        let behind = -1;
        for (let zombie = 0; zombie < plain.count && behind < 0; zombie++) {
            if (plain.x[zombie] > plain.x[first] - 40) continue;
            if (zombie === first || plain.state[zombie] !== ZOMBIE_WALKING) continue;
            const d = Math.sqrt(
                (plain.x[zombie] - plain.x[first]) * (plain.x[zombie] - plain.x[first]) +
                    (plain.y[zombie] - plain.y[first]) * (plain.y[zombie] - plain.y[first]),
            );
            if (d > 60 && d < 260) behind = zombie;
        }
        expect(behind).toBeGreaterThanOrEqual(0);
        const ax = plain.x[first];
        const ay = plain.y[first] - 14;
        const bx = plain.x[behind];
        const by = plain.y[behind] - 14;
        const length = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
        const fromX = Math.round(ax + ((ax - bx) / length) * 20);
        const fromY = Math.round(ay + ((ay - by) / length) * 20);
        const aim = zombieDartAim({ fromX, fromY, toX: bx, toY: by });
        if (!aim) throw new Error("no aim");
        // Nothing else is entered on the way to the first, at the step it is shot at.
        for (let zombie = 0; zombie < plain.count; zombie++) {
            if (zombie === first || plain.state[zombie] !== ZOMBIE_WALKING) continue;
            expect(zombieDartEnters(fromX, fromY, ax, ay, plain.x[zombie], plain.y[zombie])).toBe(-1);
        }
        const one = dartEntry({ ...aim, shotStep });
        const crowd = new ZombieCrowd(horde({ count: 600, avatars: encodeZombieLog([one]) }));
        while (crowd.steps <= one.applyStep) crowd.step();
        expect(shotZombies(crowd)).toEqual([first]);
        expect(crowd.state[behind]).toBe(ZOMBIE_WALKING);
        // The same dart shot again a step later, its fallen zombie lying on its way: it goes on to another one.
        const again = dartEntry({ ...aim, shotStep: shotStep + 1 });
        const twice = new ZombieCrowd(horde({ count: 600, avatars: encodeZombieLog([one, again]) }));
        while (twice.steps <= again.applyStep) twice.step();
        const killed = shotZombies(twice);
        expect(killed).toHaveLength(2);
        expect(killed).toContain(first);
    });

    it("goes neither through a wall nor further than its range", () => {
        const shotStep = 150;
        const plain = crowdAt(horde(), shotStep);
        const target = clearTarget(plain, 100);
        const fromX = Math.round(plain.x[target] + 100);
        const fromY = Math.round(plain.y[target] - 10);
        const entry = dartEntry({ fromX, fromY, toX: fromX - NERF_DART_RANGE_PX, toY: fromY, shotStep });
        // A wall across the map 50 px west of the shooter.
        const walls = { east: new Set<string>(), south: new Set<string>() };
        const wallCell = Math.floor((fromX - 50) / TERRAIN_CELL);
        for (let y = 0; y < 80; y++) walls.east.add(cellKey(wallCell, y));
        const walled = zombieTerrainOf(120, 80, () => 0, undefined, walls);
        expect(
            zombieDartReach(
                { fromX, fromY, toX: fromX - 384, toY: fromY },
                { width: 120, height: 80, terrain: walled },
            ),
        ).toBeLessThan(60);
        // The horde is not stopped by that wall before the shot (it is the plain one up to there): only the dart is.
        const behindWall = new ZombieCrowd(horde({ avatars: encodeZombieLog([entry]) }, walled));
        while (behindWall.steps <= entry.applyStep) behindWall.step();
        expect(shotZombies(behindWall)).toEqual([]);
        // Out of its range: shot from 500 px away, it falls short.
        const far = dartEntry({
            fromX: Math.round(plain.x[target] + 500),
            fromY,
            toX: Math.round(plain.x[target] + 500 - NERF_DART_RANGE_PX),
            toY: fromY,
            shotStep,
        });
        const short = new ZombieCrowd(horde({ avatars: encodeZombieLog([far]) }));
        while (short.steps <= far.applyStep) short.step();
        expect(shotZombies(short)).toEqual([]);
    });

    it("is the same crowd wherever it is stepped, told the dart at once or just before it applies", () => {
        const shotStep = 150;
        const plain = crowdAt(horde(), shotStep);
        const target = clearTarget(plain, 60);
        const fromX = Math.round(plain.x[target] + 60);
        const fromY = Math.round(plain.y[target] - 10);
        const entry = dartEntry({ fromX, fromY, toX: fromX - NERF_DART_RANGE_PX, toY: fromY, shotStep });
        const told = horde({ avatars: encodeZombieLog([entry]) });
        const atOnce = new ZombieCrowd(told);
        atOnce.advanceTo(START + 30_000);
        // Told the dart only once its flight was over, a step before the log applies it (as a browser that joins).
        const late = new ZombieCrowd(horde({ safeStep: entry.applyStep - 1 }));
        late.advanceTo(START + 30_000);
        expect(late.steps).toBe(entry.applyStep);
        late.setLog(encodeZombieLog([entry]), 1_000_000);
        late.advanceTo(START + 30_000);
        expect(late.checksum()).toBe(atOnce.checksum());
        // Its zombie fell, and is gone 3 s later: the crowd is not the one nobody shot at.
        expect(atOnce.hitStep[target]).toBeLessThan(shotStep + ZOMBIE_DART_TICKS);
        expect(shotZombies(atOnce)).toHaveLength(0);
        expect(atOnce.checksum()).not.toBe(crowdAt(horde(), atOnce.steps).checksum());
    });

    it("is the crowd it was: the same number after the same steps, with darts and a sped-up one", () => {
        const plain = crowdAt(horde({ count: 400 }), 120);
        const target = clearTarget(plain, 80);
        const fromX = Math.round(plain.x[target] + 80);
        const fromY = Math.round(plain.y[target] - 10);
        const log = [
            dartEntry({ fromX, fromY, toX: fromX - 384, toY: fromY + 40, shotStep: 120 }),
            dartEntry({ fromX, fromY, toX: fromX - 384, toY: fromY, shotStep: 123 }),
            dartEntry({ fromX, fromY: fromY + 30, toX: fromX - 300, toY: fromY - 200, shotStep: 126, stride: 3 }),
        ];
        const crowd = new ZombieCrowd(horde({ count: 400, avatars: encodeZombieLog(log) }));
        for (let step = 0; step < 400; step++) crowd.step();
        // Each dart met a zombie, the one on the sped-up map too.
        expect(Array.from(crowd.hitStep).filter((step) => step < 1_000_000)).toHaveLength(3);
        expect(crowd.checksum()).toBe(DART_REFERENCE_CHECKSUM);
    });

    it("leaves alone a dart the log could not apply: its flight not over, or shot too long before", () => {
        const plain = crowdAt(horde(), 150);
        const target = clearTarget(plain, 12);
        const fromX = Math.round(plain.x[target] + 12);
        const fromY = Math.round(plain.y[target] - 10);
        const dart = { fromX, fromY, toX: fromX - 384, toY: fromY, shotStep: 150, stride: 1 };
        expect(zombieDartFits(dart, 162)).toBe(true);
        expect(zombieDartFits(dart, 161)).toBe(false);
        expect(zombieDartFits(dart, 150 + ZOMBIE_DART_HISTORY_STEPS)).toBe(false);
        expect(zombieDartFits({ ...dart, stride: 11 }, 400)).toBe(false);
        for (const applyStep of [161, 150 + ZOMBIE_DART_HISTORY_STEPS]) {
            const crowd = new ZombieCrowd(
                horde({ avatars: encodeZombieLog([{ applyStep, changes: [], darts: [dart] }]) }),
            );
            while (crowd.steps <= applyStep) crowd.step();
            expect(shotZombies(crowd)).toEqual([]);
            expect(crowd.checksum()).toBe(crowdAt(horde(), crowd.steps).checksum());
        }
    });

    it("is told in the log with its way, even towards the north and the west, and read back the same", () => {
        const log: ZombieLogEntry[] = [
            { applyStep: 40, changes: [{ slot: 0, tile: 3 }] },
            {
                applyStep: 400,
                changes: [],
                darts: [
                    { fromX: 10, fromY: 5, toX: -374, toY: 5, shotStep: 120, stride: 10 },
                    { fromX: 900, fromY: 700, toX: 1100, toY: 372, shotStep: 399 - 13, stride: 1 },
                ],
            },
        ];
        expect(decodeZombieLog(encodeZombieLog(log))).toEqual(log);
    });

    it("aims where it is shot, at its range, and flies as fast to the eye on a map sped up", () => {
        expect(zombieDartAim({ fromX: 100.4, fromY: 200.6, toX: 200, toY: 201 })).toEqual({
            fromX: 100,
            fromY: 201,
            toX: 484,
            toY: 201,
        });
        expect(zombieDartAim({ fromX: 100, fromY: 100, toX: 100, toY: 100 })).toBeUndefined();
        expect(ZOMBIE_DART_TICKS).toBe(12);
        expect(zombieDartStride(100)).toBe(1);
        expect(zombieDartStride(20)).toBe(5);
        expect(zombieDartStride(1)).toBe(10);
        // A body is met on screen: from its feet up.
        expect(zombieDartEnters(0, 90, 50, 90, 25, 100)).toBeCloseTo((25 - 7.3) / 50, 1);
        expect(zombieDartEnters(0, 100 - ZOMBIE_DART_BODY_PX - 1, 50, 100 - ZOMBIE_DART_BODY_PX - 1, 25, 100)).toBe(-1);
    });

    it("steps with nothing but what every engine computes the same", () => {
        const source = readFileSync(new URL("../src/Catastrophe/ZombieDart.ts", import.meta.url), "utf8");
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
