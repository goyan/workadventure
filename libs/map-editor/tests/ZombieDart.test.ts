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
    zombieDartAimed,
    zombieDartEnters,
    zombieDartFits,
    zombieDartReach,
    zombieDartStride,
    zombieDartWay,
} from "../src/Catastrophe/ZombieDart";
import type { ZombieDart } from "../src/Catastrophe/ZombieDart";
import {
    ZombieLogWriter,
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

/**
 * The zombies a dart goes through, worked out from the rules alone on the crowd nobody shot at: at each tick of its
 * flight, the part of its way it covers then (up to a wall), against the body of each zombie walking at that step, where
 * the crowd keeps it (half pixels). Each once, in the order met.
 */
function crossedBy(told: ZombieHorde, dart: ZombieDart, terrain: Uint8Array = new Uint8Array(120 * 80)): number[] {
    const plain = new ZombieCrowd(told);
    const { ux, uy, length } = zombieDartWay(dart);
    const reach = zombieDartReach(dart, { width: 120, height: 80, terrain });
    const crossed: number[] = [];
    for (let tick = 0; tick < ZOMBIE_DART_TICKS; tick++) {
        const near = (length * tick) / ZOMBIE_DART_TICKS;
        if (near >= reach) break;
        const far = Math.min(reach, (length * (tick + 1)) / ZOMBIE_DART_TICKS);
        while (plain.steps < dart.shotStep + tick * dart.stride) plain.step();
        for (let zombie = 0; zombie < plain.count; zombie++) {
            if (plain.state[zombie] !== ZOMBIE_WALKING || crossed.includes(zombie)) continue;
            const at = zombieDartEnters(
                dart.fromX + ux * near,
                dart.fromY + uy * near,
                dart.fromX + ux * far,
                dart.fromY + uy * far,
                Math.round(plain.x[zombie] * 2) / 2,
                Math.round(plain.y[zombie] * 2) / 2,
            );
            if (at >= 0) crossed.push(zombie);
        }
    }
    return crossed;
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
        // Seen at the step it was shot at: falling, while the crowd still has it walking.
        const seen = crowd.dartsSeen();
        expect(seen).toHaveLength(1);
        const hit = seen[0].hits[0];
        expect(hit).toMatchObject({ zombie: target, step: shotStep });
        expect(hit.distance).toBeLessThan(12);
        expect(crowd.state[target]).toBe(ZOMBIE_WALKING);
        // The log applies it once its flight is over: the zombies it went through are killed, it first, and only them.
        while (crowd.steps <= entry.applyStep) crowd.step();
        const crossed = crossedBy(horde(), {
            fromX,
            fromY,
            toX: fromX - NERF_DART_RANGE_PX,
            toY: fromY,
            shotStep,
            stride: 1,
        });
        expect(crossed[0]).toBe(target);
        expect(shotZombies(crowd)).toEqual([...crossed].sort((a, b) => a - b));
        expect(seen[0].hits.map((met) => met.zombie)).toEqual(crossed);
        expect(crowd.hitStep[target]).toBe(shotStep);
        // Laid where the dart met it, a little further west along the dart; not burning, not thrown up.
        expect(crowd.x[target]).toBeCloseTo(hit.x - ZOMBIE_DART_RECOIL_PX, 5);
        expect(crowd.y[target]).toBe(hit.y);
        expect(crowd.z[target]).toBe(0);
        // Gone ZOMBIE_DART_FALL_STEPS after it was met.
        while (crowd.steps < shotStep + ZOMBIE_DART_FALL_STEPS - 1) crowd.step();
        expect(crowd.state[target]).toBe(ZOMBIE_SHOT);
        crowd.step();
        expect(crowd.state[target]).not.toBe(ZOMBIE_SHOT);
        expect(crowd.state[target]).not.toBe(ZOMBIE_WALKING);
    });

    it("goes through every zombie on its way and kills them all; a second dart passes the fallen ones by", () => {
        const shotStep = 200;
        const told = horde({ count: 600 });
        const plain = crowdAt(told, shotStep);
        const first = clearTarget(plain, 20);
        // Shot through it towards another zombie 2 to 9 m west of it, from 20 px before it: the first such line on
        // which the dart, as the rules have it, goes through more than one zombie.
        let crossed: number[] = [];
        let one: ZombieLogEntry | undefined;
        let aim: ReturnType<typeof zombieDartAim>;
        for (let other = 0; other < plain.count && crossed.length < 2; other++) {
            if (other === first || plain.state[other] !== ZOMBIE_WALKING) continue;
            if (plain.x[other] > plain.x[first] - 40) continue;
            const ax = plain.x[first];
            const ay = plain.y[first] - 14;
            const bx = plain.x[other];
            const by = plain.y[other] - 14;
            const length = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
            if (length < 60 || length > 260) continue;
            aim = zombieDartAim({
                fromX: ax + ((ax - bx) / length) * 20,
                fromY: ay + ((ay - by) / length) * 20,
                toX: bx,
                toY: by,
            });
            if (!aim) continue;
            one = dartEntry({ ...aim, shotStep });
            crossed = crossedBy(told, { ...aim, shotStep, stride: 1 });
        }
        if (!one || !aim) throw new Error("no line through two zombies");
        // All of them on its way, the first one first.
        expect(crossed.length).toBeGreaterThanOrEqual(2);
        expect(crossed[0]).toBe(first);
        const crowd = new ZombieCrowd(horde({ count: 600, avatars: encodeZombieLog([one]) }));
        while (crowd.steps <= one.applyStep) crowd.step();
        expect(shotZombies(crowd)).toEqual([...crossed].sort((a, b) => a - b));
        // A browser that looks at it at every step of its flight sees the same zombies fall, in the same order.
        const watched = new ZombieCrowd(horde({ count: 600, avatars: encodeZombieLog([one]) }));
        while (watched.steps < one.applyStep) {
            watched.step();
            watched.dartsSeen();
        }
        expect(watched.dartsSeen()[0].hits.map((hit) => hit.zombie)).toEqual(crossed);
        for (const zombie of crossed) expect(crowd.hitStep[zombie]).toBeGreaterThanOrEqual(crowd.hitStep[first]);
        // The same dart shot again a step later, the fallen lying on its way: it kills none of them again.
        const again = dartEntry({ ...aim, shotStep: shotStep + 1 });
        const twice = new ZombieCrowd(horde({ count: 600, avatars: encodeZombieLog([one, again]) }));
        while (twice.steps <= again.applyStep) twice.step();
        for (const zombie of crossed) expect(twice.hitStep[zombie]).toBe(crowd.hitStep[zombie]);
        expect(shotZombies(twice).length).toBeGreaterThanOrEqual(crossed.length);
    });

    it("goes neither through a wall nor further than its range", () => {
        const shotStep = 150;
        const plain = crowdAt(horde(), shotStep);
        const target = clearTarget(plain, 100);
        const fromX = Math.round(plain.x[target] + 100);
        const fromY = Math.round(plain.y[target] - 10);
        const entry = dartEntry({ fromX, fromY, toX: fromX - NERF_DART_RANGE_PX, toY: fromY, shotStep });
        const open = new ZombieCrowd(horde({ avatars: encodeZombieLog([entry]) }));
        while (open.steps <= entry.applyStep) open.step();
        expect(shotZombies(open)).toContain(target);
        // A wall of 20 cells north to south in the middle of the map (x = 976 px), which the horde runs round: shot
        // westwards from 30 px east of it at zombies that ran west of it, as the rules have it the dart would go through
        // some of them; the wall stops it, and they all live.
        const walls = { east: new Set<string>(), south: new Set<string>() };
        for (let y = 30; y < 50; y++) walls.east.add(cellKey(60, y));
        const walled = zombieTerrainOf(120, 80, () => 0, undefined, walls);
        const ranRound = crowdAt(horde({}, walled), shotStep);
        let beyond: ZombieDart | undefined;
        for (let zombie = 0; zombie < ranRound.count && !beyond; zombie++) {
            const { x, y } = { x: ranRound.x[zombie], y: ranRound.y[zombie] };
            if (ranRound.state[zombie] !== ZOMBIE_WALKING || x < 700 || x > 940 || y < 32 * 16 || y > 48 * 16) continue;
            const aim = zombieDartAim({ fromX: 1006, fromY: y - 10, toX: x, toY: y - 10 });
            if (!aim) continue;
            const dart = { ...aim, shotStep, stride: 1 };
            if (crossedBy(horde({}, walled), dart).length > 0) beyond = dart;
        }
        if (!beyond) throw new Error("no zombie west of the wall on a line");
        expect(zombieDartReach(beyond, { width: 120, height: 80, terrain: walled })).toBeLessThan(40);
        expect(crossedBy(horde({}, walled), beyond, walled)).toEqual([]);
        const spared = dartEntry(beyond);
        const behindWall = new ZombieCrowd(horde({ avatars: encodeZombieLog([spared]) }, walled));
        while (behindWall.steps <= spared.applyStep) behindWall.step();
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
        // Each dart met a zombie at least, the one on the sped-up map too.
        expect(Array.from(crowd.hitStep).filter((step) => step < 1_000_000).length).toBeGreaterThanOrEqual(3);
        expect(crowd.checksum()).toBe(DART_REFERENCE_CHECKSUM);
    });

    it("goes through the thick of a horde, many zombies a dart: the same number in every engine", () => {
        // A horde of 2 000 running east, shot westwards along its rows from just before its front, 30 darts, two on a
        // sped-up tick. Node, Chrome 145, Firefox 132 and JavaScriptCore give this number and these kills.
        const thick = horde({ count: 2000, durationMs: 180_000 });
        const aiming = new ZombieCrowd(thick);
        const darts: ZombieLogEntry[] = [];
        for (let k = 0; k < 30; k++) {
            const shotStep = 150 + k * 7;
            while (aiming.steps < shotStep) aiming.step();
            let front = -1;
            for (let zombie = 0; zombie < aiming.count; zombie++) {
                if (aiming.state[zombie] !== ZOMBIE_WALKING || aiming.x[zombie] > 1700) continue;
                if (front < 0 || aiming.x[zombie] > aiming.x[front]) front = zombie;
            }
            if (front < 0) continue;
            const fromX = Math.round(aiming.x[front] + 20);
            const fromY = Math.round(aiming.y[front] - 12 + (k % 5) * 6 - 12);
            const toY = fromY + (k % 3) * 20 - 20;
            darts.push(dartEntry({ fromX, fromY, toX: fromX - 384, toY, shotStep, stride: k % 10 === 4 ? 2 : 1 }));
        }
        darts.sort((a, b) => a.applyStep - b.applyStep);
        const pierced = new ZombieCrowd({ ...thick, avatars: encodeZombieLog(darts) });
        for (let step = 0; step < 600; step++) pierced.step();
        expect(Array.from(pierced.hitStep).filter((step) => step < 1_000_000)).toHaveLength(98);
        expect(pierced.checksum()).toBe(1035516661);
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
        // Aimed so at any angle, and taken so by the server; a dart not at its range is not.
        for (let angle = 0; angle < 6.3; angle += 0.01) {
            const aimed = zombieDartAim({
                fromX: 50.4,
                fromY: 70.7,
                toX: 50.4 + Math.cos(angle) * 100,
                toY: 70.7 + Math.sin(angle) * 100,
            });
            expect(aimed && zombieDartAimed(aimed)).toBe(true);
        }
        expect(zombieDartAimed({ fromX: 0, fromY: 0, toX: 300, toY: 0 })).toBe(false);
        expect(zombieDartAimed({ fromX: 0.5, fromY: 0, toX: 384.5, toY: 0 })).toBe(false);
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

describe("the log of a horde, as it grows", () => {
    /** A log as the server writes it: the avatars each second, a dart every 3 steps, a grenade now and then. */
    function grownLog(): ZombieLogEntry[] {
        const log: ZombieLogEntry[] = [];
        for (let step = 0; step < 300; step += 3) {
            if (step % 10 === 0) log.push({ applyStep: step + 25, changes: [{ slot: step % 7, tile: 400 + step }] });
            log.push({
                applyStep: step + 26,
                changes: [],
                darts: [{ fromX: 900 + step, fromY: 600, toX: 516 + step, toY: 640 - step, shotStep: step, stride: 1 }],
            });
            if (step % 30 === 0) {
                log.push({
                    applyStep: step + 40,
                    changes: [],
                    grenades: [{ fromX: 1400, fromY: 600, toX: 1000, toY: 620 }],
                });
            }
        }
        return log;
    }

    it("is written entry after entry the same as all at once, whatever the pieces, from a text read back too", () => {
        const log = grownLog();
        const writer = new ZombieLogWriter();
        let at = 0;
        for (const piece of [1, 2, 3, 5, 8, 13, 1, 1, 40]) {
            writer.append(log.slice(at, at + piece));
            at += piece;
            expect(writer.text).toBe(encodeZombieLog(log.slice(0, at)));
        }
        const again = ZombieLogWriter.of(writer.text, decodeZombieLog(writer.text));
        again.append(log.slice(at));
        writer.append(log.slice(at));
        expect(again.text).toBe(encodeZombieLog(log));
        expect(writer.text).toBe(encodeZombieLog(log));
        expect(writer.entries).toEqual(log);
    });

    it("is read as it grows into the same crowd, told another log once (a whole one) and refused one too early", () => {
        const log = grownLog();
        const told = horde({ avatars: encodeZombieLog(log), safeStep: 1_000_000 });
        const whole = new ZombieCrowd(told);
        whole.advanceTo(START + 35_000);
        // A browser: told the log as it grows, its entries complete to 24 steps ahead.
        const grown = new ZombieCrowd(horde({ safeStep: -1 }));
        // Another browser, told the entries as they were glued: one array growing.
        const glued = new ZombieCrowd(horde({ safeStep: -1, log: [] }));
        const gluedLog: ZombieLogEntry[] = [];
        let refused = false;
        for (let step = 0; step < 350; step++) {
            // What the server wrote by then: up to its last entry applied at most 26 steps ahead.
            let count = 0;
            for (let at = 0; at < log.length; at++) if (log[at].applyStep <= step + 26) count = at + 1;
            const prefix = log.slice(0, count);
            if (step === 120) {
                // Another log once: the darts of the last steps told in another order (as a whole log after a
                // loss), those already applied the same.
                const other = [...prefix.filter((entry) => !entry.darts || entry.applyStep < 130)];
                other.push(...prefix.filter((entry) => entry.darts && entry.applyStep >= 130));
                grown.setLog(encodeZombieLog(other), step + 24);
                glued.setLogEntries(other, step + 24);
            }
            if (step === 200 && !refused) {
                // An entry applied before what was applied already: refused, nothing changes.
                const before = grown.checksum();
                grown.setLog(
                    encodeZombieLog([...prefix, { applyStep: 150, changes: [{ slot: 1, tile: 9 }] }]),
                    step + 24,
                );
                expect(grown.checksum()).toBe(before);
                gluedLog.push({ applyStep: 150, changes: [{ slot: 1, tile: 9 }] });
                glued.setLogEntries(gluedLog, step + 24);
                gluedLog.pop();
                expect(glued.checksum()).toBe(before);
                refused = true;
            }
            grown.setLog(encodeZombieLog(prefix), step + 24);
            grown.advanceTo(START + step * 100 + 50, 2);
            gluedLog.push(...prefix.slice(gluedLog.length));
            glued.setLogEntries(gluedLog, step + 24);
            glued.advanceTo(START + step * 100 + 50, 2);
        }
        grown.setLog(encodeZombieLog(log), 1_000_000);
        grown.advanceTo(START + 35_000);
        glued.setLogEntries(log, 1_000_000);
        glued.advanceTo(START + 35_000);
        expect(glued.checksum()).toBe(whole.checksum());
        expect(grown.steps).toBe(whole.steps);
        expect(grown.checksum()).toBe(whole.checksum());
        expect(Array.from(grown.hitStep)).toEqual(Array.from(whole.hitStep));
    });
});
