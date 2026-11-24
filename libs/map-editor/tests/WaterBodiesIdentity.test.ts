import { describe, expect, it } from "vitest";
import { emptyPopulation, LIFE_STEP_MS, stepPopulation } from "../src/Life/Population";
import { landPlacesOf, WADE_DEPTH_PX } from "../src/Life/LandPlaces";
import { DOLPHIN_DEPTH_PX, FISH_DEPTH_PX, waterBodiesOf } from "../src/Life/WaterBodies";
import type { WaterBodies, WaterCell } from "../src/Life/WaterBodies";
import { dryOnBridges } from "../src/Terrain/Bridges";
import { cellMaskOf } from "../src/Terrain/CellMask";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { WaterSnapshot, WaterSnapshotView } from "../src/Terrain/WaterView";
import type { WaterView } from "../src/Terrain/WaterView";
import type { LifeSettings } from "../src/types";
import { scripted } from "./lifeHelpers";

const SIDES = [
    { side: "east", dx: 1, dy: 0 },
    { side: "west", dx: -1, dy: 0 },
    { side: "south", dx: 0, dy: 1 },
    { side: "north", dx: 0, dy: -1 },
] as const;

/**
 * The bodies of water as they were read before the cells were read as they are kept: each cell asked through
 * `depthAt` and `canCross`, the excluded cells through a key of text. What `waterBodiesOf` must still answer.
 */
function bodiesAsBefore(grid: WaterView, excluded?: (cellX: number, cellY: number) => boolean): WaterBodies {
    const { x: left, y: top, width, height } = grid.bounds;
    const depthAt = (cellX: number, cellY: number): number =>
        excluded?.(cellX, cellY) ? 0 : grid.depthAt(cellX, cellY);
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    const queue = new Int32Array(width * height);
    for (let start = 0; start < labels.length; start++) {
        if (labels[start] !== 0) continue;
        if (depthAt(left + (start % width), top + Math.floor(start / width)) < FISH_DEPTH_PX) continue;
        const body = sizes.length;
        const size = { cells: 0, deep: 0 };
        sizes.push(size);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = body;
        while (head < tail) {
            const index = queue[head++];
            const cellX = left + (index % width);
            const cellY = top + Math.floor(index / width);
            size.cells++;
            if (depthAt(cellX, cellY) >= DOLPHIN_DEPTH_PX) size.deep++;
            for (const { side, dx, dy } of SIDES) {
                if (!grid.canCross(cellX, cellY, side)) continue;
                const next = index + dx + dy * width;
                if (labels[next] !== 0 || depthAt(cellX + dx, cellY + dy) < FISH_DEPTH_PX) continue;
                labels[next] = body;
                queue[tail++] = next;
            }
        }
    }
    const bodyAt = (cellX: number, cellY: number): number => {
        const column = cellX - left;
        const row = cellY - top;
        if (column < 0 || row < 0 || column >= width || row >= height) return 0;
        return labels[row * width + column];
    };
    const canCross = (cellX: number, cellY: number, dx: number, dy: number): boolean => {
        const side = SIDES.find((candidate) => candidate.dx === dx && candidate.dy === dy);
        return side !== undefined && grid.canCross(cellX, cellY, side.side);
    };
    return {
        sizes,
        bodyAt,
        swimmable: (cellX, cellY, minDepth) => depthAt(cellX, cellY) >= minDepth,
        passable: (cellX, cellY, minDepth) => depthAt(cellX, cellY) >= minDepth,
        canCross,
        comfortAt: (cellX, cellY) => depthAt(cellX, cellY),
        anyCell: (body, minDepth, random) => {
            if (body === 0) return undefined;
            let chosen: WaterCell | undefined;
            let seen = 0;
            for (let index = 0; index < labels.length; index++) {
                if (labels[index] !== body) continue;
                const cellX = left + (index % width);
                const cellY = top + Math.floor(index / width);
                if (depthAt(cellX, cellY) < minDepth) continue;
                seen++;
                if (random() * seen < 1) chosen = { cellX, cellY };
            }
            return chosen;
        },
        randomCell: (body, near, reach, minDepth, random) => {
            if (body === 0) return undefined;
            const candidates: WaterCell[] = [];
            for (let cellY = near.cellY - reach; cellY <= near.cellY + reach; cellY++) {
                for (let cellX = near.cellX - reach; cellX <= near.cellX + reach; cellX++) {
                    if (bodyAt(cellX, cellY) === body && depthAt(cellX, cellY) >= minDepth) {
                        candidates.push({ cellX, cellY });
                    }
                }
            }
            if (candidates.length === 0) return undefined;
            return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        },
    };
}

// A map of 70 × 44 cells whose grid starts at (-4, 3): a lake, a pond joined to it by a channel, a pool, a wall
// across the lake with a door in it, and flat ground the flood covers.
const BOUNDS = { x: -4, y: 3, width: 70, height: 44 };
const heights = new Map<string, number>();
for (let y = 8; y < 34; y++) for (let x = 2; x < 34; x++) heights.set(cellKey(x, y), -30);
for (let y = 14; y < 30; y++) for (let x = 42; x < 60; x++) heights.set(cellKey(x, y), -22);
for (let x = 34; x < 42; x++) for (let y = 20; y < 23; y++) heights.set(cellKey(x, y), -12);
for (let y = 36; y < 42; y++) for (let x = 10; x < 20; x++) heights.set(cellKey(x, y), -24);
const terrain = withHeights(undefined, heights);
/** A wall across the lake, along the east side of the column 17, open between the rows 18 and 21 (the door). */
const walls = { east: new Set<string>(), south: new Set<string>() };
for (let y = 8; y < 34; y++) if (y < 18 || y > 21) walls.east.add(cellKey(17, y));
const door = {
    east: new Set([cellKey(17, 18), cellKey(17, 19), cellKey(17, 20), cellKey(17, 21)]),
    south: new Set<string>(),
};
/** The cells of the pool: no fish lives in its water. */
const pool: { x: number; y: number }[] = [];
for (let y = 36; y < 42; y++) for (let x = 10; x < 20; x++) pool.push({ x, y });
const poolKeys = new Set(pool.map(({ x, y }) => `${x},${y}`));
const inPoolAsBefore = (cellX: number, cellY: number): boolean => poolKeys.has(`${cellX},${cellY}`);
const inPool = cellMaskOf(pool);

const still: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [], inertia: true, seconds: 0.1 };
/** A flood that rises (two strong sources, a rain), then goes down (two sinks, the ground that drinks). */
const rising: WaterStepInput = {
    ...still,
    rainPx: 0.6,
    flows: [
        { cellX: 8, cellY: 12, px: 900, radius: 3 },
        { cellX: 50, cellY: 20, px: 500, radius: 3 },
    ],
};
const falling: WaterStepInput = {
    ...still,
    evaporationPx: 0.15,
    absorptionPx: 0.4,
    flows: [
        { cellX: 26, cellY: 28, px: -1500, radius: 4 },
        { cellX: 52, cellY: 24, px: -900, radius: 4 },
    ],
};

/** Everything two readings of the bodies of a water can be asked, on its cells and past its edges. */
function answers(bodies: WaterBodies): unknown[] {
    const all: unknown[] = [bodies.sizes];
    for (let y = BOUNDS.y - 1; y <= BOUNDS.y + BOUNDS.height; y++) {
        for (let x = BOUNDS.x - 1; x <= BOUNDS.x + BOUNDS.width; x++) {
            all.push(
                bodies.bodyAt(x, y),
                bodies.swimmable(x, y, FISH_DEPTH_PX),
                bodies.passable(x, y, DOLPHIN_DEPTH_PX),
                bodies.comfortAt(x, y),
                bodies.canCross(x, y, 1, 0),
                bodies.canCross(x, y, -1, 0),
                bodies.canCross(x, y, 0, 1),
                bodies.canCross(x, y, 0, -1),
            );
        }
    }
    // The draws: the same luck gives the same cells.
    const random = scripted();
    for (let body = 0; body < bodies.sizes.length; body++) {
        all.push(bodies.anyCell(body, FISH_DEPTH_PX, random), bodies.anyCell(body, DOLPHIN_DEPTH_PX, random));
        all.push(bodies.randomCell(body, { cellX: 10, cellY: 14 }, 9, FISH_DEPTH_PX, random));
        all.push(bodies.randomCell(body, { cellX: 48, cellY: 20 }, 6, DOLPHIN_DEPTH_PX, random));
    }
    return all;
}

/** The flood, step after step: `seen` is called at each tenth step with the grid as it is. */
function flood(seen: (grid: WaterGrid, step: number) => void): void {
    const grid = new WaterGrid(terrain, BOUNDS, undefined, walls);
    for (let step = 0; step < 420; step++) {
        // The door closes while the water rises, opens, and closes again as it goes down.
        if (step === 60) grid.setClosedDoors(door);
        if (step === 180) grid.setClosedDoors(undefined);
        if (step === 300) grid.setClosedDoors(door);
        grid.step(step < 220 ? rising : falling);
        if (step % 10 === 0) seen(grid, step);
    }
}

const life: LifeSettings = {
    enabled: true,
    reproductionDelay: 5,
    maxLifespan: 240,
    maxSpeed: 1.5,
    huntInterval: 5,
    dolphinReproductionDelay: 10,
    dolphinMaxLifespan: 3600,
    drinkInterval: 120,
};

describe("waterBodiesOf, read from the cells as they are kept", () => {
    it("reads the same bodies as asking each cell did, through a flood that rises and goes down", () => {
        let bodiesSeen = 0;
        let wettest = 0;
        flood((grid, step) => {
            const before = bodiesAsBefore(grid, inPoolAsBefore);
            const now = waterBodiesOf(grid, inPool);
            expect(answers(now), `at step ${step}`).toEqual(answers(before));
            // And from a copy of the water, as a room reads the water computed on another thread.
            const snapshot = WaterSnapshot.allocate(grid.bounds);
            grid.publish(snapshot, step);
            const view = new WaterSnapshotView(snapshot);
            view.refresh();
            expect(answers(waterBodiesOf(view, inPool)), `the copy at step ${step}`).toEqual(answers(before));
            bodiesSeen = Math.max(bodiesSeen, before.sizes.length - 1);
            wettest = Math.max(wettest, grid.wetCells());
        });
        // The scenario does what it says: several bodies at a time, and a flood over most of the map.
        expect(bodiesSeen).toBeGreaterThan(1);
        expect(wettest).toBeGreaterThan((BOUNDS.width * BOUNDS.height) / 2);
    }, 120_000);

    it("leaves the water of a pool to no fish, and without excluded cells reads it as any water", () => {
        const grid = new WaterGrid(terrain, BOUNDS, undefined, walls);
        for (let step = 0; step < 220; step++) grid.step(rising);
        expect(grid.depthAt(14, 38)).toBeGreaterThan(DOLPHIN_DEPTH_PX);
        expect(waterBodiesOf(grid, inPool).bodyAt(14, 38)).toBe(0);
        expect(waterBodiesOf(grid).bodyAt(14, 38)).toBeGreaterThan(0);
        expect(answers(waterBodiesOf(grid))).toEqual(answers(bodiesAsBefore(grid)));
    });

    it("gives the life of the water the same fish, bit for bit", () => {
        const lives = [bodiesAsBefore, waterBodiesOf].map((read, at) => {
            const population = emptyPopulation();
            const random = scripted();
            const told: string[] = [];
            let now = 0;
            let most = 0;
            flood((grid) => {
                const bodies = read(grid, at === 0 ? inPoolAsBefore : inPool);
                // Twenty steps of the life on each state of the water: births, hunts, fish that flee a dry cell.
                for (let step = 0; step < 20; step++) {
                    stepPopulation(population, grid, bodies, life, LIFE_STEP_MS, now, random);
                    now += LIFE_STEP_MS;
                }
                most = Math.max(most, population.animals.length);
                told.push(JSON.stringify(population));
            });
            return { told, most };
        });
        // Fish were born, swam and died along the flood: the same ones, at each state of the water.
        expect(lives[0].most).toBeGreaterThan(4);
        expect(lives[1].told).toEqual(lives[0].told);
    }, 120_000);
});

/**
 * The bodies of the land as they were read before each cell was asked once: flooded from the edges of the map, each
 * neighbour asked through `canCross` and `depthAt`. Returns the body of each cell and the sizes.
 */
function landAsBefore(
    width: number,
    height: number,
    landWalls: { east: ReadonlySet<string>; south: ReadonlySet<string> },
    depthAt: (cellX: number, cellY: number) => number,
): { labels: Int32Array; sizes: { cells: number; deep: number }[] } {
    const inside = (cellX: number, cellY: number): boolean =>
        cellX >= 0 && cellY >= 0 && cellX < width && cellY < height;
    const closed = new Uint8Array(width * height);
    for (const [sides, bit] of [
        [landWalls.east, 1],
        [landWalls.south, 2],
    ] as const) {
        for (const key of sides) {
            const [x, y] = key.split(",").map(Number);
            if (inside(x, y)) closed[y * width + x] |= bit;
        }
    }
    const canCross = (cellX: number, cellY: number, dx: number, dy: number): boolean => {
        if (!inside(cellX, cellY) || !inside(cellX + dx, cellY + dy)) return false;
        const index = cellY * width + cellX;
        if (dx === 1 && dy === 0) return (closed[index] & 1) === 0;
        if (dx === -1 && dy === 0) return (closed[index - 1] & 1) === 0;
        if (dx === 0 && dy === 1) return (closed[index] & 2) === 0;
        if (dx === 0 && dy === -1) return (closed[index - width] & 2) === 0;
        return false;
    };
    const walkable = (index: number): boolean => depthAt(index % width, Math.floor(index / width)) < WADE_DEPTH_PX;
    const labels = new Int32Array(width * height);
    const sizes: { cells: number; deep: number }[] = [{ cells: 0, deep: 0 }];
    const queue = new Int32Array(width * height);
    const flood = (start: number): void => {
        if (labels[start] !== 0 || !walkable(start)) return;
        const body = sizes.length;
        const size = { cells: 0, deep: 0 };
        sizes.push(size);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = body;
        while (head < tail) {
            const index = queue[head++];
            const cellX = index % width;
            const cellY = Math.floor(index / width);
            size.cells++;
            for (const { dx, dy } of SIDES) {
                if (!canCross(cellX, cellY, dx, dy)) continue;
                const next = index + dx + dy * width;
                if (labels[next] !== 0 || !walkable(next)) continue;
                labels[next] = body;
                queue[tail++] = next;
            }
        }
    };
    for (let cellX = 0; cellX < width; cellX++) {
        flood(cellX);
        flood((height - 1) * width + cellX);
    }
    for (let cellY = 0; cellY < height; cellY++) {
        flood(cellY * width);
        flood(cellY * width + width - 1);
    }
    return { labels, sizes };
}

describe("landPlacesOf, each cell asked once", () => {
    it("reads the same land as asking each neighbour did, through the flood, with walls and a bridge", () => {
        const width = 66;
        const height = 47;
        const landWalls = {
            east: new Set([...walls.east, cellKey(40, 30), cellKey(40, 31), cellKey(40, 32)]),
            south: new Set([cellKey(44, 33), cellKey(45, 33), cellKey(46, 33)]),
            signature: "walls",
        };
        // A bridge over the channel between the lake and the pond: what walks crosses the water on its deck.
        const bridges = new Set(["18,10", "19,10", "18,11", "19,11"]);
        let pieces = 0;
        let shoresSeen = 0;
        flood((grid, step) => {
            const depthAt = dryOnBridges((cellX, cellY) => grid.depthAt(cellX, cellY), bridges);
            const before = landAsBefore(width, height, landWalls, depthAt);
            const land = landPlacesOf({ width, height, walls: landWalls, depthAt, trees: [] });
            expect(land.sizes, `sizes at step ${step}`).toEqual(before.sizes);
            const labels: number[] = [];
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) labels.push(land.bodyAt(x, y));
            expect(labels, `bodies at step ${step}`).toEqual(Array.from(before.labels));
            // The cells beside water, read once by the land (the first time an animal is thirsty): the nearest
            // shore from every fourth cell is the one asking each cell and its neighbours finds.
            const shores: number[] = [];
            for (let y = 0; y < height; y++)
                for (let x = 0; x < width; x++) if (land.atShore?.(x, y)) shores.push(y * width + x);
            for (let y = 0; y < height; y += 4) {
                for (let x = 0; x < width; x += 4) {
                    let nearest: number | undefined;
                    let least = Infinity;
                    for (const index of shores) {
                        const far = ((index % width) - x) ** 2 + (Math.floor(index / width) - y) ** 2;
                        if (far < least && depthAt(index % width, Math.floor(index / width)) < WADE_DEPTH_PX) {
                            least = far;
                            nearest = index;
                        }
                    }
                    const found = land.shoreNear?.(-1, x, y, WADE_DEPTH_PX);
                    expect(found && found.cellY * width + found.cellX, `shore near ${x},${y} at step ${step}`).toBe(
                        nearest,
                    );
                }
            }
            shoresSeen = Math.max(shoresSeen, shores.length);
            pieces = Math.max(pieces, before.sizes.length - 1);
        });
        // The flood cuts the land into pieces at some point.
        expect(pieces).toBeGreaterThan(1);
        expect(shoresSeen).toBeGreaterThan(50);
    }, 120_000);
});

describe("cellMaskOf", () => {
    it("answers as a set of keys of text does, inside and outside the cells, for any number", () => {
        const cells = [
            { x: -3, y: 2 },
            { x: 0, y: 0 },
            { x: 7, y: -5 },
            { x: 7, y: 9 },
        ];
        const keys = new Set(cells.map(({ x, y }) => `${x},${y}`));
        const mask = cellMaskOf(cells);
        for (let y = -8; y <= 12; y += 0.5) {
            for (let x = -6; x <= 10; x += 0.5) expect(mask(x, y), `${x},${y}`).toBe(keys.has(`${x},${y}`));
        }
        expect(cellMaskOf([])(0, 0)).toBe(false);
        expect(mask(Number.NaN, 0)).toBe(false);
    });

    it("keeps the water off the tiles under the bridges as the keys of text did", () => {
        const bridges = new Set(["2,3", "-1,0", "5,5"]);
        const depthAt = (cellX: number, cellY: number): number => cellX * 100 + cellY + 0.5;
        const dry = dryOnBridges(depthAt, bridges);
        for (let y = -6; y <= 14; y++) {
            for (let x = -6; x <= 14; x++) {
                const under = bridges.has(`${Math.floor(x / 2)},${Math.floor(y / 2)}`);
                expect(dry(x, y), `${x},${y}`).toBe(under ? 0 : depthAt(x, y));
            }
        }
        expect(dryOnBridges(depthAt, new Set())).toBe(depthAt);
    });
});
