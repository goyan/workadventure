/* eslint-disable no-await-in-loop -- tests step through time sequentially */
import { describe, expect, it } from "vitest";
import { mulberry32, wanderSeed } from "../../../../../src/front/Phaser/Game/Wander/WanderRandom";
import {
    LEG_MS,
    MIN_PAUSE_MS,
    RADIUS_TILES,
    TILE_SIZE,
    isDrinkLeg,
    WanderSchedule,
    wanderLegOffset,
} from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import type { Point, Shore, WanderMap } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

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

    it("now and then sits on a seat of the map, reached from the walkable spot next to it", async () => {
        // A chair whose tile is blocked by its hitbox; the seat is in the middle of it.
        const chairTile = { x: 17, y: 15 };
        const seat = centreOf(chairTile);
        const map = { ...makeMap(new Set([`${chairTile.x},${chairTile.y}`])), seats: () => [seat] };
        const schedule = new WanderSchedule("cat", NEST, map);
        let satDown = 0;
        for (let leg = 1; leg <= 40; leg++) {
            const pose = await poseResolved(schedule, at(leg, LEG_MS - 1, "cat"));
            if (pose && pose.x === seat.x && pose.y === seat.y) {
                satDown++;
                expect(pose.moving).toBe(false);
            }
        }
        // SEAT_CHANCE of the legs, give or take the draw: some, but not all.
        expect(satDown).toBeGreaterThan(3);
        expect(satDown).toBeLessThan(30);
    });

    describe("radius", () => {
        // Everything is free and every path is a straight line: only the radius bounds the destinations.
        const openMap: WanderMap = {
            isWalkable: () => true,
            findPath: (from, to) => Promise.resolve([from, to]),
        };
        const farNest = centreOf({ x: 50, y: 50 });

        it("keeps every destination within the given radius", async () => {
            const schedule = new WanderSchedule("lion", farNest, openMap, 2);
            let awayFromNest = 0;
            for (let step = 0; step < 40; step++) {
                const pose = await poseResolved(schedule, 3 * LEG_MS + step * 3_700);
                expect(pose).toBeDefined();
                expect(Math.abs((pose as Point).x - farNest.x)).toBeLessThanOrEqual(2 * TILE_SIZE + TILE_SIZE / 2);
                expect(Math.abs((pose as Point).y - farNest.y)).toBeLessThanOrEqual(2 * TILE_SIZE + TILE_SIZE / 2);
                if (pose?.x !== farNest.x || pose?.y !== farNest.y) awayFromNest++;
            }
            expect(awayFromNest).toBeGreaterThan(0);
        });

        it("the default radius is unchanged", async () => {
            const implicit = new WanderSchedule("duck", farNest, openMap);
            const explicit = new WanderSchedule("duck", farNest, openMap, RADIUS_TILES);
            for (let step = 0; step < 40; step++) {
                const now = 3 * LEG_MS + step * 3_700;
                expect(await poseResolved(implicit, now)).toEqual(await poseResolved(explicit, now));
            }
        });

        it("only sits on the seats within the given radius", async () => {
            // A seat 4 tiles away: within the default radius, out of a radius of 2.
            const seat = centreOf({ x: 54, y: 50 });
            const map: WanderMap = { ...openMap, seats: () => [seat] };
            const near = new WanderSchedule("cat", farNest, map, 2);
            const far = new WanderSchedule("cat", farNest, map);
            let satNear = 0;
            let satFar = 0;
            for (let leg = 1; leg <= 40; leg++) {
                const nearPose = await poseResolved(near, at(leg, LEG_MS - 1, "cat"));
                const farPose = await poseResolved(far, at(leg, LEG_MS - 1, "cat"));
                if (nearPose?.x === seat.x && nearPose.y === seat.y) satNear++;
                if (farPose?.x === seat.x && farPose.y === seat.y) satFar++;
            }
            expect(satNear).toBe(0);
            expect(satFar).toBeGreaterThan(0);
        });
    });
});

describe("WanderSchedule, drinking", () => {
    const INTERVAL = 3 * LEG_MS;
    // A pond east of the tile (17, 15): the shore is that tile, turned to the east.
    const SHORE: Shore = { ...centreOf({ x: 17, y: 15 }), toward: "right" };
    const thirstyMap = (shores = [SHORE], interval = INTERVAL): WanderMap => ({
        ...makeMap(),
        shores: () => shores,
        drinkIntervalMs: () => interval,
    });
    const drinkLegs = (entityId: string, interval: number, count: number): number[] => {
        const legs: number[] = [];
        for (let leg = 1000; legs.length < count; leg++) if (isDrinkLeg(entityId, leg, interval)) legs.push(leg);
        return legs;
    };

    it("one leg in each interval is a leg to drink, not the same one for every animal", () => {
        const duck = drinkLegs("duck", INTERVAL, 3);
        expect(duck[1] - duck[0]).toBe(3);
        expect(duck[2] - duck[1]).toBe(3);
        const phases = new Set(
            ["duck", "lion", "tigre", "chat", "chien", "a", "b"].map((id) => drinkLegs(id, INTERVAL, 1)[0] % 3),
        );
        expect(phases.size).toBeGreaterThan(1);
    });

    it("an interval shorter than a leg is a drink on every leg", () => {
        expect(isDrinkLeg("duck", 1000, 1_000)).toBe(true);
        expect(isDrinkLeg("duck", 1001, 1_000)).toBe(true);
    });

    it("on a leg to drink, the animal walks to the shore, turns to the water and drinks", async () => {
        const [leg] = drinkLegs("duck", INTERVAL, 1);
        const schedule = new WanderSchedule("duck", NEST, thirstyMap());
        const walking = await poseResolved(schedule, at(leg, 100));
        expect(walking?.drinking).toBeUndefined();
        const drinking = await poseResolved(schedule, at(leg, LEG_MS - 1_000));
        expect(drinking).toMatchObject({ x: SHORE.x, y: SHORE.y, direction: "right", moving: false, drinking: true });
    });

    it("does not drink on the other legs", async () => {
        const [leg] = drinkLegs("duck", INTERVAL, 1);
        const schedule = new WanderSchedule("duck", NEST, thirstyMap());
        const pose = await poseResolved(schedule, at(leg + 1, LEG_MS - 1_000));
        expect(pose?.drinking).toBeUndefined();
    });

    it("goes to one of the nearest shores, the same one on every browser", async () => {
        const far: Shore = { ...centreOf({ x: 24, y: 24 }), toward: "down" };
        const [leg] = drinkLegs("duck", INTERVAL, 1);
        const a = await poseResolved(new WanderSchedule("duck", NEST, thirstyMap([far, SHORE])), at(leg, LEG_MS - 1));
        const b = await poseResolved(new WanderSchedule("duck", NEST, thirstyMap([SHORE, far])), at(leg, LEG_MS - 1));
        expect(a).toEqual(b);
        expect(a?.drinking).toBe(true);
    });

    it("wanders as usual when no water is within its reach, or none can be walked to", async () => {
        const [leg] = drinkLegs("duck", INTERVAL, 1);
        const tooFar: Shore = { ...centreOf({ x: 28, y: 15 }), toward: "right" };
        const none = await poseResolved(new WanderSchedule("duck", NEST, thirstyMap([tooFar])), at(leg, LEG_MS - 1));
        expect(none?.drinking).toBeUndefined();
        // The shore is walled in.
        const walls = new Set(["16,15", "18,15", "17,14", "17,16"]);
        const walled: WanderMap = { ...makeMap(walls), shores: () => [SHORE], drinkIntervalMs: () => INTERVAL };
        const unreachable = await poseResolved(new WanderSchedule("duck", NEST, walled), at(leg, LEG_MS - 1));
        expect(unreachable?.drinking).toBeUndefined();
    });

    it("never drinks on a map that tells no interval", async () => {
        const map: WanderMap = { ...makeMap(), shores: () => [SHORE] };
        const schedule = new WanderSchedule("duck", NEST, map);
        for (let leg = 1000; leg < 1006; leg++) {
            expect((await poseResolved(schedule, at(leg, LEG_MS - 1)))?.drinking).toBeUndefined();
        }
    });
});
