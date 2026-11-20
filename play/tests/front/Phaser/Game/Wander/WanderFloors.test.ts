/* eslint-disable no-await-in-loop -- the walks are stepped through time */
import { describe, expect, it } from "vitest";
import { FloorModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/FloorModel";
import { wanderFloorsOf } from "../../../../../src/front/Phaser/Game/Wander/WanderFloors";
import { LEG_MS, WanderSchedule } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";
import type { Point, WanderMap } from "../../../../../src/front/Phaser/Game/Wander/WanderSchedule";

const centre = (x: number, y: number, z?: number): Point =>
    z ? { x: x * 32 + 16, y: y * 32 + 16, z } : { x: x * 32 + 16, y: y * 32 + 16 };
const inGrid = (tile: Point): boolean => tile.x >= 0 && tile.y >= 0 && tile.x < 12 && tile.y < 12;

/**
 * A storey at 52 px over the tiles x 2..4, y 4..6, reached by a stair going north whose foot is the tile (3, 8): it
 * covers the tiles (3, 7) and (3, 8), starts from the tile (3, 9) of the ground and arrives on the tile (3, 6).
 */
function storey(withStair = true): FloorModel {
    const model = new FloorModel();
    for (let x = 2; x <= 4; x++) for (let y = 4; y <= 6; y++) model.setSlab(52, x, y, "parquet-clair");
    if (withStair) model.addStair({ direction: "n", width: 1, rise: 52, open: false }, { x: 3, y: 8 }, 0);
    return model;
}

/**
 * A bridge over a river (the column x = 5 of the ground): a ramp going east on the tile (3, 5), a deck at 20 px over
 * the tiles (4..6, 5), a ramp going west on the tile (7, 5).
 */
function bridge(): { model: FloorModel; groundWalkable: (tile: Point) => boolean } {
    const model = new FloorModel();
    for (let x = 4; x <= 6; x++) model.setSlab(20, x, 5, "bois");
    model.addStair({ direction: "e", width: 1, rise: 20, open: false, ramp: true }, { x: 3, y: 5 }, 0);
    model.addStair({ direction: "o", width: 1, rise: 20, open: false, ramp: true }, { x: 7, y: 5 }, 0);
    return { model, groundWalkable: (tile) => inGrid(tile) && tile.x !== 5 };
}

describe("wanderFloorsOf", () => {
    it("goes up a stair: its foot on the ground, its head on the floor, then the tiles of the floor", () => {
        const floors = wanderFloorsOf({ model: storey(), groundWalkable: inGrid });
        const route = floors.route(centre(3, 10), centre(2, 4, 52));
        expect(route[0]).toEqual(centre(3, 10));
        expect(route.at(-1)).toEqual(centre(2, 4, 52));
        const foot = route.findIndex((point) => point.x === 112 && point.y === 9 * 32);
        expect(foot).toBeGreaterThan(0);
        expect(route[foot]).toEqual({ x: 112, y: 288 });
        expect(route[foot + 1]).toEqual({ x: 112, y: 224, z: 52 });
        // Before the stair on the ground, after it on the floor.
        expect(route.slice(0, foot + 1).every((point) => point.z === undefined)).toBe(true);
        expect(route.slice(foot + 1).every((point) => point.z === 52)).toBe(true);
    });

    it("comes back down by the same stair", () => {
        const floors = wanderFloorsOf({ model: storey(), groundWalkable: inGrid });
        const route = floors.route(centre(2, 4, 52), centre(3, 10));
        const head = route.findIndex((point) => point.x === 112 && point.y === 224);
        expect(route[head]).toEqual({ x: 112, y: 224, z: 52 });
        expect(route[head + 1]).toEqual({ x: 112, y: 288 });
        expect(route.at(-1)).toEqual(centre(3, 10));
    });

    it("stays on its floor between two tiles of it", () => {
        const floors = wanderFloorsOf({ model: storey(), groundWalkable: inGrid });
        const route = floors.route(centre(2, 4, 52), centre(4, 6, 52));
        expect(route.length).toBeGreaterThan(2);
        expect(route.every((point) => point.z === 52)).toBe(true);
    });

    it("crosses a river by a bridge: up a ramp, along the deck, down the other ramp", () => {
        const { model, groundWalkable } = bridge();
        const floors = wanderFloorsOf({ model, groundWalkable });
        expect(floors.route(centre(1, 5), centre(9, 5))).toEqual([
            centre(1, 5),
            centre(2, 5),
            { x: 96, y: 176 },
            { x: 128, y: 176, z: 20 },
            centre(4, 5, 20),
            centre(5, 5, 20),
            centre(6, 5, 20),
            { x: 224, y: 176, z: 20 },
            { x: 256, y: 176 },
            centre(8, 5),
            centre(9, 5),
        ]);
    });

    it("finds no way to a floor without a stair, nor to a tile without a slab", () => {
        const noStair = wanderFloorsOf({ model: storey(false), groundWalkable: inGrid });
        expect(noStair.route(centre(3, 10), centre(2, 4, 52))).toEqual([]);
        const floors = wanderFloorsOf({ model: storey(), groundWalkable: inGrid });
        expect(floors.route(centre(3, 10), centre(8, 8, 52))).toEqual([]);
        // An altitude that is no floor of the map.
        expect(floors.route(centre(3, 10), centre(2, 4, 84))).toEqual([]);
    });

    it("does not walk through the furniture of a floor, nor through its walls", () => {
        const { model, groundWalkable } = bridge();
        const table = wanderFloorsOf({
            model,
            groundWalkable,
            occupied: (level, tile) => level === 20 && tile.x === 5 && tile.y === 5,
        });
        expect(table.route(centre(1, 5), centre(9, 5))).toEqual([]);
        const wall = wanderFloorsOf({
            model,
            groundWalkable,
            blocked: (level, from, to) => level === 20 && Math.min(from.x, to.x) === 4 && Math.max(from.x, to.x) === 5,
        });
        expect(wall.route(centre(1, 5), centre(9, 5))).toEqual([]);
        // The same wall on the ground stops nobody on the deck.
        const groundWall = wanderFloorsOf({
            model,
            groundWalkable,
            blocked: (level, from, to) => level === 0 && Math.min(from.x, to.x) === 4 && Math.max(from.x, to.x) === 5,
        });
        expect(groundWall.route(centre(1, 5), centre(9, 5)).length).toBeGreaterThan(0);
    });

    it("tells the floors one can stand on over a tile: a slab, not under a stair of that floor, not on furniture", () => {
        const model = storey();
        // A second stair, standing on the storey: nobody stands on the slab it covers.
        model.addStair({ direction: "e", width: 1, rise: 32, open: false }, { x: 3, y: 4 }, 52);
        const floors = wanderFloorsOf({
            model,
            groundWalkable: inGrid,
            occupied: (level, tile) => level === 52 && tile.x === 4 && tile.y === 6,
        });
        expect(floors.levelsAt({ x: 2, y: 4 })).toEqual([52]);
        expect(floors.levelsAt({ x: 3, y: 4 })).toEqual([]);
        expect(floors.levelsAt({ x: 4, y: 6 })).toEqual([]);
        expect(floors.levelsAt({ x: 8, y: 8 })).toEqual([]);
    });

    it("does not look for a way further than its reach around both ends", () => {
        // A long detour: the deck is cut, the only other way is far around (beyond the reach).
        const model = new FloorModel();
        for (let x = 0; x <= 60; x++) model.setSlab(52, x, 0, "parquet-clair");
        for (let y = 0; y <= 40; y++) {
            model.setSlab(52, 0, y, "parquet-clair");
            model.setSlab(52, 60, y, "parquet-clair");
        }
        for (let x = 0; x <= 60; x++) if (x !== 30) model.setSlab(52, x, 40, "parquet-clair");
        const floors = wanderFloorsOf({ model, groundWalkable: () => false });
        expect(floors.route(centre(28, 40, 52), centre(32, 40, 52))).toEqual([]);
        expect(floors.route(centre(20, 40, 52), centre(28, 40, 52)).length).toBeGreaterThan(0);
    });

    it("gives the same walk to every client: it only depends on the map", () => {
        const first = bridge();
        const second = bridge();
        const a = wanderFloorsOf(first).route(centre(1, 7), centre(9, 3));
        const b = wanderFloorsOf(second).route(centre(1, 7), centre(9, 3));
        expect(a.length).toBeGreaterThan(0);
        expect(a).toEqual(b);
    });
});

describe("a wandering character and a bridge", () => {
    /** The map of the manager in small: the walk of the ground first (4 neighbours), the floors when it finds none. */
    function bridgeMap(): WanderMap {
        const { model, groundWalkable } = bridge();
        // The ground under the ramps is closed, as the manager closes it.
        const walkable = (tile: Point): boolean =>
            groundWalkable(tile) && !(tile.y === 5 && (tile.x === 3 || tile.x === 7));
        const floors = wanderFloorsOf({ model, groundWalkable: walkable });
        const groundPath = (from: Point, to: Point): Point[] => {
            const start = { x: Math.floor(from.x / 32), y: Math.floor(from.y / 32) };
            const goal = { x: Math.floor(to.x / 32), y: Math.floor(to.y / 32) };
            const previous = new Map<string, Point | undefined>([[`${start.x},${start.y}`, undefined]]);
            const queue = [start];
            for (let head = 0; head < queue.length; head++) {
                const current = queue[head];
                if (current.x === goal.x && current.y === goal.y) {
                    const path: Point[] = [];
                    for (let step: Point | undefined = current; step; step = previous.get(`${step.x},${step.y}`)) {
                        path.unshift(centre(step.x, step.y));
                    }
                    return path;
                }
                for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    const next = { x: current.x + dx, y: current.y + dy };
                    if (walkable(next) && !previous.has(`${next.x},${next.y}`)) {
                        previous.set(`${next.x},${next.y}`, current);
                        queue.push(next);
                    }
                }
            }
            return [];
        };
        return {
            isWalkable: walkable,
            levelsAt: (tile) => floors.levelsAt(tile),
            findPath: (from, to) => {
                if ((from.z ?? 0) > 0 || (to.z ?? 0) > 0) return Promise.resolve(floors.route(from, to));
                const path = groundPath(from, to);
                return Promise.resolve(path.length > 0 ? path : floors.route(from, to));
            },
        };
    }

    async function poseAt(schedule: WanderSchedule, now: number) {
        schedule.poseAt(now);
        for (let i = 0; i < 200; i++) await Promise.resolve();
        return schedule.poseAt(now);
    }

    it("crosses the river on the deck, by the ramps, and never walks on the water", async () => {
        const schedule = new WanderSchedule("duck-bridge", centre(2, 5), bridgeMap(), 6);
        let onDeck = 0;
        let onRamp = 0;
        let farBank = 0;
        for (let now = 2 * LEG_MS; now < 80 * LEG_MS; now += 700) {
            const pose = await poseAt(schedule, now);
            if (!pose) continue;
            const z = pose.z ?? 0;
            const column = Math.floor(pose.x / 32);
            // Over the river: on the deck only, at its altitude.
            if (column === 5) {
                expect(z).toBe(20);
                expect(Math.floor(pose.y / 32)).toBe(5);
            }
            if (z === 20) onDeck++;
            else if (z > 0) onRamp++;
            else if (column > 5) farBank++;
        }
        expect(onDeck).toBeGreaterThan(0);
        expect(onRamp).toBeGreaterThan(0);
        expect(farBank).toBeGreaterThan(0);
    });

    it("is at the same place and the same altitude on two clients at any time", async () => {
        const a = new WanderSchedule("duck-bridge", centre(2, 5), bridgeMap(), 6);
        const b = new WanderSchedule("duck-bridge", centre(2, 5), bridgeMap(), 6);
        for (let now = 2 * LEG_MS; now < 30 * LEG_MS; now += 1_900) {
            const pose = await poseAt(a, now);
            // The second client arrives at that moment: it computes only the legs around now.
            expect(await poseAt(b, now)).toEqual(pose);
            b.reset();
        }
    });
});
