/* eslint-disable no-await-in-loop -- tests step through time sequentially */
import { describe, expect, it } from "vitest";
import { mulberry32, wanderSeed } from "../../../../../src/front/Phaser/Game/Wander/WanderRandom";
import {
    LEG_MS,
    MIN_PAUSE_MS,
    RADIUS_TILES,
    TILE_SIZE,
    WanderSchedule,
    wanderLegOffset,
} from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import type { Point, WanderMap } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const GRID = 30;

function tileOf(p: Point): Point {
    return { x: Math.floor(p.x / TILE_SIZE), y: Math.floor(p.y / TILE_SIZE) };
}

function centreOf(tile: Point): Point {
    return { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 };
}

// 30 x 30 grid, walls are given as "x,y" strings. 4-neighbour BFS, deterministic.
function makeMap(walls: Set<string> = new Set()): WanderMap {
    const walkable = (t: Point) => t.x >= 0 && t.y >= 0 && t.x < GRID && t.y < GRID && !walls.has(`${t.x},${t.y}`);
    return {
        isWalkable: walkable,
        findPath: (from, to) => {
            const start = tileOf(from);
            const goal = tileOf(to);
            const previous = new Map<string, Point | undefined>([[`${start.x},${start.y}`, undefined]]);
            const queue = [start];
            while (queue.length > 0) {
                const current = queue.shift() as Point;
                if (current.x === goal.x && current.y === goal.y) {
                    const path: Point[] = [];
                    let step: Point | undefined = current;
                    while (step) {
                        path.unshift(centreOf(step));
                        step = previous.get(`${step.x},${step.y}`);
                    }
                    return Promise.resolve(path);
                }
                for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    const next = { x: current.x + dx, y: current.y + dy };
                    const key = `${next.x},${next.y}`;
                    if (walkable(next) && !previous.has(key)) {
                        previous.set(key, current);
                        queue.push(next);
                    }
                }
            }
            return Promise.resolve([]);
        },
    };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 100; i++) {
        await Promise.resolve();
    }
}

async function poseResolved(schedule: WanderSchedule, now: number) {
    schedule.poseAt(now);
    await flush();
    return schedule.poseAt(now);
}

const NEST = centreOf({ x: 15, y: 15 });

/** The time at `ms` into leg `leg` of the entity: the leg boundaries are shifted per entity. */
function at(leg: number, ms = 0, entityId = "duck"): number {
    return leg * LEG_MS - wanderLegOffset(entityId) + ms;
}

// Always a long path (60 points, about 1900 px) ending on the requested destination: the character walks until the
// pause.
const longPathMap: WanderMap = {
    isWalkable: () => true,
    findPath: (from, to) => {
        const path: Point[] = [];
        for (let i = 0; i < 59; i++) path.push({ x: from.x + i * TILE_SIZE, y: from.y });
        path.push(to);
        return Promise.resolve(path);
    },
};

describe("WanderRandom", () => {
    it("wanderSeed has a fixed value", () => {
        // FNV-1a 32 bits of "a:0:0", checked against an independent reference (python, 64-bit ints masked to 32).
        expect(wanderSeed("a", 0, 0)).toBe(2558443612);
    });

    it("mulberry32 has a fixed value", () => {
        // Checked against an independent python implementation of mulberry32.
        expect(mulberry32(1)()).toBeCloseTo(MULBERRY_1, 12);
    });
});

const MULBERRY_1 = 0.6270739405881613;

describe("WanderSchedule", () => {
    it("same inputs give same poses", async () => {
        const walls = new Set(["14,15", "16,15", "15,14"]);
        const a = new WanderSchedule("duck", NEST, makeMap(walls));
        const b = new WanderSchedule("duck", NEST, makeMap(walls));
        for (let i = 0; i < 10; i++) {
            const now = 5 * LEG_MS + i * 1_900;
            expect(await poseResolved(a, now)).toEqual(await poseResolved(b, now));
        }
    });

    it("destinations stay within radius and are walkable", async () => {
        const walls = new Set<string>();
        for (let x = 0; x < GRID; x += 3) walls.add(`${x},${(x * 7) % GRID}`);
        const map = makeMap(walls);
        const schedule = new WanderSchedule("duck", NEST, map);
        const nestTile = tileOf(NEST);
        let awayFromNest = 0;
        for (let leg = 1; leg <= 50; leg++) {
            // The pose at the end of the leg is the destination of the leg.
            const pose = await poseResolved(schedule, at(leg, LEG_MS - 1));
            expect(pose).toBeDefined();
            const tile = tileOf(pose as Point);
            expect(Math.abs(tile.x - nestTile.x)).toBeLessThanOrEqual(RADIUS_TILES);
            expect(Math.abs(tile.y - nestTile.y)).toBeLessThanOrEqual(RADIUS_TILES);
            expect(map.isWalkable(tile)).toBe(true);
            expect((await map.findPath(NEST, pose as Point)).length).toBeGreaterThan(0);
            if (pose?.x !== NEST.x || pose?.y !== NEST.y) {
                awayFromNest++;
            }
        }
        // The character does wander: not every destination is the nest.
        expect(awayFromNest).toBeGreaterThan(0);
    });

    it("enclosed nest", async () => {
        const walls = new Set(["14,14", "15,14", "16,14", "14,15", "16,15", "14,16", "15,16", "16,16"]);
        const schedule = new WanderSchedule("duck", NEST, makeMap(walls));
        for (let i = 0; i < 10; i++) {
            const pose = await poseResolved(schedule, 3 * LEG_MS + i * 2_000);
            expect(pose).toMatchObject({ x: NEST.x, y: NEST.y, moving: false });
        }
    });

    it("nest outside grid", async () => {
        const map: WanderMap = { isWalkable: () => false, findPath: () => Promise.resolve([]) };
        const nest = { x: 5000, y: 5000 };
        const schedule = new WanderSchedule("duck", nest, map);
        for (let i = 0; i < 5; i++) {
            const pose = await poseResolved(schedule, 2 * LEG_MS + i * 3_000);
            expect(pose).toMatchObject({ x: nest.x, y: nest.y, moving: false });
        }
    });

    it("continuity", async () => {
        const schedule = new WanderSchedule("duck", NEST, makeMap());
        for (let k = 1; k <= 8; k++) {
            const before = await poseResolved(schedule, at(k, LEG_MS - 1));
            const after = await poseResolved(schedule, at(k + 1));
            expect(before).toBeDefined();
            expect(after).toBeDefined();
            expect(before?.x).toBe(after?.x);
            expect(before?.y).toBe(after?.y);
        }
    });

    it("pause at least MIN_PAUSE_MS", async () => {
        const schedule = new WanderSchedule("duck", NEST, longPathMap);
        const k = 4;
        const arrival = await poseResolved(schedule, at(k + 1));
        const atPauseStart = await poseResolved(schedule, at(k, LEG_MS - MIN_PAUSE_MS));
        expect(atPauseStart).toMatchObject({ x: arrival?.x, y: arrival?.y, moving: false });
        const earlier = await poseResolved(schedule, at(k, 1_000));
        expect(earlier?.moving).toBe(true);
    });

    it("counts the time since the arrival while paused", async () => {
        const schedule = new WanderSchedule("duck", NEST, longPathMap);
        const k = 4;
        expect((await poseResolved(schedule, at(k, 1_000)))?.pausedMs).toBe(0);
        // The long path is walked in exactly LEG_MS - MIN_PAUSE_MS.
        const pose = await poseResolved(schedule, at(k, LEG_MS - 1_000));
        expect(pose?.moving).toBe(false);
        expect(pose?.pausedMs).toBeCloseTo(MIN_PAUSE_MS - 1_000, 0);
    });

    it("a leg spent at the same place continues the pause of the previous one", async () => {
        const walls = new Set(["14,14", "15,14", "16,14", "14,15", "16,15", "14,16", "15,16", "16,16"]);
        const schedule = new WanderSchedule("duck", NEST, makeMap(walls));
        const pose = await poseResolved(schedule, at(3, 0));
        expect(pose?.moving).toBe(false);
        // Counted as paused for a whole leg already: a character that does not move stays in its longest rest pose.
        expect(pose?.pausedMs).toBe(LEG_MS);
    });

    it("mid-leg", async () => {
        const walls = new Set(["14,15", "16,15"]);
        const follower = new WanderSchedule("duck", NEST, makeMap(walls));
        const k = 6;
        await poseResolved(follower, at(k));
        const followed = await poseResolved(follower, at(k, 7_000));
        const fresh = new WanderSchedule("duck", NEST, makeMap(walls));
        const joined = await poseResolved(fresh, at(k, 7_000));
        expect(joined).toBeDefined();
        expect(joined).toEqual(followed);
    });

    it("stale path after setNest", async () => {
        const pending: { resolve: (p: Point[]) => void }[] = [];
        let hold = true;
        const base = makeMap();
        const map: WanderMap = {
            isWalkable: (tile) => base.isWalkable(tile),
            findPath: (from, to) => {
                if (hold) {
                    return new Promise<Point[]>((resolve) => {
                        pending.push({ resolve });
                    });
                }
                return base.findPath(from, to);
            },
        };
        const schedule = new WanderSchedule("duck", NEST, map);
        expect(schedule.poseAt(at(3))).toBeUndefined();
        await flush();
        // More than RADIUS_TILES away from the old nest (15, 15): a stale destination cannot pass for a new one.
        const otherNest = centreOf({ x: 3, y: 3 });
        schedule.setNest(otherNest);
        // Release the stale computation with a path leading away from the new nest.
        hold = false;
        for (const p of pending) p.resolve([NEST, { x: NEST.x + 64, y: NEST.y }]);
        await flush();
        // Both ends of the leg are relative to the new nest.
        for (const pose of [await poseResolved(schedule, at(3)), await poseResolved(schedule, at(3, LEG_MS - 1))]) {
            expect(pose).toBeDefined();
            const tile = tileOf(pose as Point);
            expect(Math.abs(tile.x - 3)).toBeLessThanOrEqual(RADIUS_TILES);
            expect(Math.abs(tile.y - 3)).toBeLessThanOrEqual(RADIUS_TILES);
        }
    });

    it("leg boundaries are shifted per entity", async () => {
        const offsetDuck = wanderLegOffset("duck");
        const offsetGoose = wanderLegOffset("goose");
        expect(offsetDuck).not.toBe(offsetGoose);
        for (const offset of [offsetDuck, offsetGoose]) {
            expect(offset).toBeGreaterThanOrEqual(0);
            expect(offset).toBeLessThan(LEG_MS);
        }
        const k = 7;
        for (const entityId of ["duck", "goose"]) {
            const schedule = new WanderSchedule(entityId, NEST, longPathMap);
            // A leg starts walking at the boundary of its entity and has stopped just before the next one.
            expect((await poseResolved(schedule, at(k, 1_000, entityId)))?.moving).toBe(true);
            const before = await poseResolved(schedule, at(k, LEG_MS - 1, entityId));
            expect(before?.moving).toBe(false);
            const after = await poseResolved(schedule, at(k + 1, 0, entityId));
            expect(after).toMatchObject({ x: before?.x, y: before?.y });
            // Mid-leg, a schedule joined late gives the same pose.
            const fresh = new WanderSchedule(entityId, NEST, longPathMap);
            expect(await poseResolved(fresh, at(k, 5_000, entityId))).toEqual(
                await poseResolved(schedule, at(k, 5_000, entityId)),
            );
        }
    });
});
