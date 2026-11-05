/* eslint-disable no-await-in-loop -- tests step through time sequentially */
import { describe, expect, it, vi } from "vitest";
import {
    GOBEUR_CATCH_DISTANCE_PX,
    GOBEUR_LEVELS,
    GOBEUR_WANDER_RADIUS_TILES,
    GobeurBrain,
} from "../../../../../src/front/Phaser/Game/Gobeur/GobeurBrain";
import type { GobeurBrainMap, GobeurTarget } from "../../../../../src/front/Phaser/Game/Gobeur/GobeurBrain";
import type { Point } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const TILE = 32;
const GRID = 30;
const SPEED = 100;

function tileOf(p: Point): Point {
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
}

function centreOf(tile: Point): Point {
    return { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 };
}

// Open grid, 4-neighbour BFS, deterministic. Size can be enlarged for long distance tests.
function makeMap(size = GRID): GobeurBrainMap {
    const walkable = (t: Point) => t.x >= 0 && t.y >= 0 && t.x < size && t.y < size;
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

// Straight line path, for long distances without BFS cost.
function makeLineMap(): GobeurBrainMap {
    return {
        isWalkable: () => true,
        findPath: (from, to) => Promise.resolve([from, to]),
    };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 100; i++) {
        await Promise.resolve();
    }
}

function lcg(seed = 1): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function target(uuid: string, tile: Point, safe = false): GobeurTarget {
    const c = centreOf(tile);
    return { uuid, x: c.x, y: c.y, safe };
}

const START = centreOf({ x: 10, y: 10 });

function makeBrain(level: "beginner" | "intermediate" | "hard", map: GobeurBrainMap = makeMap()) {
    return new GobeurBrain(START, level, map, SPEED, lcg(), TILE);
}

// First update starts the computation, the second one applies it.
async function settle(brain: GobeurBrain, now: number, targets: GobeurTarget[]) {
    brain.update(now, 0, targets);
    await flush();
    return brain.update(now, 0, targets);
}

describe("GobeurBrain", () => {
    it("exposes the level table", () => {
        expect(GOBEUR_LEVELS.beginner).toEqual({ speedFactor: 0.7, detectionTiles: 6, repathMs: 1500 });
        expect(GOBEUR_LEVELS.intermediate).toEqual({ speedFactor: 0.95, detectionTiles: 10, repathMs: 800 });
        expect(GOBEUR_LEVELS.hard).toEqual({ speedFactor: 2.5, detectionTiles: null, repathMs: 400 });
        expect(GOBEUR_CATCH_DISTANCE_PX).toBe(16);
        expect(GOBEUR_WANDER_RADIUS_TILES).toBe(5);
    });

    it("chases the closest target and ignores safe ones", async () => {
        const brain = makeBrain("intermediate");
        await settle(brain, 0, [
            target("far", { x: 17, y: 10 }),
            target("near", { x: 10, y: 14 }),
            target("safe", { x: 10, y: 11 }, true),
        ]);
        expect(brain.targetUuid).toBe("near");
    });

    it("beginner ignores a target 7 tiles away, intermediate chases it, hard chases at 50 tiles", async () => {
        const t = [target("a", { x: 17, y: 10 })];
        const beginner = makeBrain("beginner");
        await settle(beginner, 0, t);
        expect(beginner.targetUuid).toBeUndefined();

        const intermediate = makeBrain("intermediate");
        await settle(intermediate, 0, t);
        expect(intermediate.targetUuid).toBe("a");

        const hard = makeBrain("hard", makeLineMap());
        await settle(hard, 0, [target("b", { x: 60, y: 10 })]);
        expect(hard.targetUuid).toBe("b");
    });

    it.each(["beginner", "intermediate", "hard"] as const)(
        "%s moves at walk speed times its factor over 0.48 s",
        async (level) => {
            const brain = makeBrain(level);
            // 5 tiles away: within the beginner range, not reached by the hard level (2.5 x) within the 0.48 s.
            const t = [target("a", { x: 15, y: 10 })];
            const before = await settle(brain, 0, t);
            let last = before;
            for (let i = 1; i <= 12; i++) {
                last = brain.update(i * 40, 40, t);
                await flush();
            }
            const moved = Math.hypot(last.x - before.x, last.y - before.y);
            expect(Math.abs(moved - SPEED * GOBEUR_LEVELS[level].speedFactor * 0.48)).toBeLessThanOrEqual(2);
            expect(last.direction).toBe("right");
        },
    );

    it("hard keeps its target when another gets closer, intermediate switches", async () => {
        const run = async (level: "intermediate" | "hard") => {
            const brain = makeBrain(level);
            await settle(brain, 0, [target("a", { x: 14, y: 10 }), target("b", { x: 10, y: 18 })]);
            expect(brain.targetUuid).toBe("a");
            const now = 5000;
            const swapped = [target("a", { x: 16, y: 10 }), target("b", { x: 10, y: 11 })];
            brain.update(now, 0, swapped);
            await flush();
            brain.update(now, 0, swapped);
            return brain.targetUuid;
        };
        expect(await run("hard")).toBe("a");
        expect(await run("intermediate")).toBe("b");
    });

    it("stops walking the chase path when its target becomes safe", async () => {
        const brain = makeBrain("intermediate");
        const a = target("a", { x: 18, y: 10 });
        await settle(brain, 0, [a]);
        let pose = brain.update(0, 0, [a]);
        for (let now = 40; now < 800; now += 40) {
            pose = brain.update(now, 40, [a]);
        }
        const safeA = { ...a, safe: true };
        const atRepath = brain.update(800, 40, [safeA]);
        expect(brain.targetUuid).toBeUndefined();
        for (let now = 840; now < 2000; now += 40) {
            pose = brain.update(now, 40, [safeA]);
        }
        expect(pose.x).toBe(atRepath.x);
        expect(pose.y).toBe(atRepath.y);
    });

    it("does not step back when a repath result is applied", async () => {
        const brain = makeBrain("intermediate");
        const a = target("a", { x: 18, y: 10 });
        await settle(brain, 0, [a]);
        for (let now = 40; now <= 120; now += 40) {
            brain.update(now, 40, [a]);
        }
        brain.update(800, 0, [a]); // starts a repath from here
        const moved = brain.update(840, 40, [a]); // moves while the search is pending
        await flush();
        const applied = brain.update(840, 0, [a]);
        expect(applied.x).toBeGreaterThanOrEqual(moved.x);
        expect(applied.direction).toBe("right");
    });

    it("stays within 5 tiles of its start for 30 s without target", async () => {
        const brain = makeBrain("beginner");
        const startTile = tileOf(START);
        for (let t = 0; t <= 30_000; t += 40) {
            const pose = brain.update(t, 40, []);
            if (t % 200 === 0) {
                await flush();
            }
            const tile = tileOf(pose);
            expect(Math.abs(tile.x - startTile.x)).toBeLessThanOrEqual(GOBEUR_WANDER_RADIUS_TILES);
            expect(Math.abs(tile.y - startTile.y)).toBeLessThanOrEqual(GOBEUR_WANDER_RADIUS_TILES);
        }
    });

    it("catches non safe targets within 16 px on every update", () => {
        const brain = makeBrain("hard");
        const close = { uuid: "c", x: START.x + 15, y: START.y, safe: false };
        expect(brain.update(0, 40, [close]).caught).toEqual(["c"]);
        expect(brain.update(40, 40, [{ ...close, safe: true }]).caught).toEqual([]);
        expect(brain.update(80, 40, [{ ...close, x: START.x + 16 }]).caught).toEqual([]);
    });

    it("wanders without looping when the only target is unreachable", async () => {
        const base = makeMap();
        const findPath = vi.fn((from: Point, to: Point) =>
            tileOf(to).x === 20 ? Promise.resolve([]) : base.findPath(from, to),
        );
        const brain = makeBrain("intermediate", { isWalkable: (tile) => base.isWalkable(tile), findPath });
        const t = [target("a", { x: 20, y: 10 })];
        for (let now = 0; now <= 10_000; now += 40) {
            brain.update(now, 40, t);
            await flush();
        }
        expect(brain.targetUuid).toBeUndefined();
        expect(findPath.mock.calls.length).toBeLessThanOrEqual(Math.ceil(10_000 / 800) + 1);
        expect(findPath.mock.calls.length).toBeGreaterThan(0);
    });
});
