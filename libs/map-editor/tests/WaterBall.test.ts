import { describe, expect, it } from "vitest";
import {
    advanceBall,
    BALL_DEFAULT_TILES,
    BALL_GROWTH_PX_PER_SECOND,
    BALL_MAX_TILES,
    BALL_MIN_TILES,
    BALL_SPEED_PX_PER_SECOND,
    ballRadiusPx,
    ballTiles,
} from "../src/Catastrophe/Ball";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { ballColumn, ballDisplaces, ballHalfHeight } from "../src/Terrain/WaterBall";
import type { WaterBall } from "../src/Terrain/WaterBall";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import type { WaterStepInput } from "../src/Terrain/WaterGrid";
import { DEFAULT_WAVE_SETTINGS, TERRAIN_CELL } from "../src/types";

const creep: WaterStepInput = { rainPx: 0, evaporationPx: 0, absorptionPx: 0, flows: [] };
const inertia: WaterStepInput = { ...creep, inertia: true, seconds: 0.1, waves: { ...DEFAULT_WAVE_SETTINGS } };
const MODES = [
    ["the water that creeps", creep],
    ["the water with inertia", inertia],
] as const;

const SIDE = 64;
const BANK = 3;
const inLake = (x: number, y: number): boolean => x >= BANK && y >= BANK && x < SIDE - BANK && y < SIDE - BANK;
const LAKE_CELLS = (SIDE - 2 * BANK) ** 2;
/** A square lake closed by high banks, so that no water leaves it: its bed at `bed`, its water at `level`. */
function lake(bed: number, level: number): WaterGrid {
    const cells = new Map<string, number>();
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) cells.set(cellKey(x, y), inLake(x, y) ? bed : 250);
    const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: SIDE, height: SIDE });
    const bytes = new Uint8Array(SIDE * SIDE * 2);
    for (let y = 0; y < SIDE; y++) {
        for (let x = 0; x < SIDE; x++) {
            const eighths = inLake(x, y) ? Math.round((level - bed) * 8) : 0;
            bytes[(y * SIDE + x) * 2] = eighths & 255;
            bytes[(y * SIDE + x) * 2 + 1] = eighths >> 8;
        }
    }
    expect(grid.readDepths(bytes)).toBe(true);
    return grid;
}
const MIDDLE = (SIDE / 2) * TERRAIN_CELL;

/** Steps a grid with a ball held (or not) for a while: what the model lost, and whether a depth was ever no number. */
function run(
    grid: WaterGrid,
    input: WaterStepInput,
    steps: number,
    ball: WaterBall,
    held: (step: number) => WaterBall | undefined,
): { ball: WaterBall; lostPx: number; finite: boolean; highest: number } {
    let lostPx = 0;
    let finite = true;
    let highest = 0;
    let now = ball;
    for (let step = 0; step < steps; step++) {
        now = advanceBall(now, held(step), 0.1);
        grid.setBalls(now.radiusPx > 0 ? [now] : []);
        lostPx += grid.step(input).lostPx;
        for (let y = BANK; y < SIDE - BANK; y++) {
            for (let x = BANK; x < SIDE - BANK; x++) {
                const depth = grid.depthAt(x, y);
                if (!Number.isFinite(depth)) finite = false;
                if (!grid.ballAt(x, y) && depth > highest) highest = depth;
            }
        }
    }
    return { ball: now, lostPx, finite, highest };
}

/** What the water no ball closes gained over a lake `depth` deep, in pixels over one cell, and how many cells it is. */
function openWater(grid: WaterGrid, depth: number): { gained: number; open: number } {
    let gained = 0;
    let open = 0;
    for (let y = BANK; y < SIDE - BANK; y++) {
        for (let x = BANK; x < SIDE - BANK; x++) {
            if (grid.ballAt(x, y)) continue;
            gained += grid.depthAt(x, y) - depth;
            open++;
        }
    }
    return { gained, open };
}

/** The volume of a ball as the cells of a grid hold it, in pixels of water over one cell. */
function cellsOf(ball: WaterBall, share: (halfHeight: number) => number): number {
    let sum = 0;
    for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) sum += share(ballHalfHeight(ball, x, y));
    return sum;
}

describe("the size of a ball", () => {
    it("is a diameter kept from 1 to 16 tiles, 4 for a size that is none", () => {
        expect([BALL_MIN_TILES, BALL_MAX_TILES, BALL_DEFAULT_TILES]).toEqual([1, 16, 4]);
        expect(ballTiles(0)).toBe(4);
        expect(ballTiles(Number.NaN)).toBe(4);
        expect(ballTiles(-3)).toBe(1);
        expect(ballTiles(99)).toBe(16);
        expect(ballTiles(6.4)).toBe(6);
        expect(ballRadiusPx(4)).toBe(64);
        expect(ballRadiusPx(16)).toBe(256);
    });
});

describe("advanceBall", () => {
    const held = { x: 1000, y: 0, radiusPx: 64 };

    it("goes after the point it is held at no faster than a ball goes, and swells no faster", () => {
        const next = advanceBall({ x: 0, y: 0, radiusPx: 0 }, held, 0.1);
        expect(next.x).toBeCloseTo(BALL_SPEED_PX_PER_SECOND * 0.1, 6);
        expect(next.y).toBe(0);
        expect(next.radiusPx).toBeCloseTo(BALL_GROWTH_PX_PER_SECOND * 0.1, 6);
    });

    it("stops where it is held, at the radius asked for", () => {
        let ball: WaterBall = { x: 990, y: 0, radiusPx: 60 };
        for (let step = 0; step < 20; step++) ball = advanceBall(ball, held, 0.1);
        expect(ball).toEqual(held);
    });

    it("shrinks where it is once nobody holds it, down to nothing", () => {
        const next = advanceBall({ x: 50, y: 60, radiusPx: 10 }, undefined, 0.1);
        expect(next).toEqual({ x: 50, y: 60, radiusPx: 10 - BALL_GROWTH_PX_PER_SECOND * 0.1 });
        expect(advanceBall(next, undefined, 5).radiusPx).toBe(0);
    });

    it("never leaps: a long time counts for a quarter of a second, a time that is none for nothing", () => {
        expect(advanceBall({ x: 0, y: 0, radiusPx: 0 }, held, 60).x).toBeCloseTo(BALL_SPEED_PX_PER_SECOND / 4, 6);
        expect(advanceBall({ x: 0, y: 0, radiusPx: 5 }, held, Number.NaN)).toEqual({ x: 0, y: 0, radiusPx: 5 });
        expect(advanceBall({ x: 0, y: 0, radiusPx: 5 }, held, -1)).toEqual({ x: 0, y: 0, radiusPx: 5 });
    });
});

describe("the ball in a column", () => {
    const ball = { x: MIDDLE, y: MIDDLE, radiusPx: 64 };

    it("stands as high as its radius in its middle, and nowhere outside its disc", () => {
        expect(ballHalfHeight(ball, SIDE / 2, SIDE / 2)).toBeGreaterThan(62);
        expect(ballHalfHeight(ball, SIDE / 2, SIDE / 2)).toBeLessThanOrEqual(64);
        expect(ballHalfHeight(ball, SIDE / 2 + 4, SIDE / 2)).toBe(0);
        expect(ballHalfHeight({ ...ball, radiusPx: 0 }, SIDE / 2, SIDE / 2)).toBe(0);
        expect(ballHalfHeight({ ...ball, radiusPx: Number.NaN }, SIDE / 2, SIDE / 2)).toBe(0);
    });

    it("holds the volume of a sphere in its cells, to a hundredth", () => {
        const sphere = ((4 / 3) * Math.PI * 64 ** 3) / TERRAIN_CELL ** 2;
        expect(cellsOf(ball, (half) => 2 * half) / sphere).toBeCloseTo(1, 2);
        // Wherever it stands between the cells.
        expect(cellsOf({ x: MIDDLE + 5, y: MIDDLE - 3, radiusPx: 64 }, (half) => 2 * half) / sphere).toBeCloseTo(1, 2);
    });

    it("fills the heights between its underside and its top, but for what is in the ground", () => {
        // A deep hollow: 36 px of room under a ball that goes 64 px under the level 0.
        expect(ballColumn(-100, 64)).toEqual({ underPx: 36, topPx: 64 });
        // A shallow one: the ball rests on its ground.
        expect(ballColumn(-20, 64)).toEqual({ underPx: 0, topPx: 64 });
        // A mount lower than the ball: its top stands out. One as high or higher: the ball is in the ground.
        expect(ballColumn(40, 64)).toEqual({ underPx: 0, topPx: 64 });
        expect(ballColumn(64, 64)).toBeUndefined();
        expect(ballColumn(200, 64)).toBeUndefined();
        expect(ballColumn(-100, 0)).toBeUndefined();
    });

    it("pushes away the water of its part that is in the water, and no more", () => {
        // Water lower than its underside: untouched.
        expect(ballDisplaces(-100, 64, -80)).toBe(0);
        // Half in the water: its lower half. In a shallow hollow: what of it is over the ground.
        expect(ballDisplaces(-100, 64, 0)).toBe(64);
        expect(ballDisplaces(-20, 64, 0)).toBe(20);
        // Under the water: all of it.
        expect(ballDisplaces(-100, 64, 90)).toBe(128);
        expect(ballDisplaces(-100, 64, -30)).toBe(34);
    });
});

describe("WaterGrid.setBalls", () => {
    it("does not touch a water that stands lower than the underside of the ball", () => {
        const grid = lake(-100, -80);
        const before = grid.writeDepths();
        expect(grid.setBalls([{ x: MIDDLE, y: MIDDLE, radiusPx: 64 }])).toBe(false);
        expect(grid.writeDepths()).toEqual(before);
        expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(false);
        expect(grid.step(creep).moved).toBe(false);
        expect(grid.step(inertia).moved).toBe(false);
    });

    it("changes nothing on a map without any ball", () => {
        const grid = lake(-100, 0);
        expect(grid.setBalls([])).toBe(false);
        expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(false);
    });

    it("is in the way of the water where it rests on dry ground", () => {
        const cells = new Map<string, number>();
        for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) cells.set(cellKey(x, y), 0);
        const grid = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: 20, height: 20 });
        expect(grid.setBalls([{ x: 160, y: 160, radiusPx: 32 }])).toBe(true);
        expect(grid.ballAt(10, 10)).toBe(true);
        expect(grid.ballAt(15, 10)).toBe(false);
        // A rain on the whole map: the ball sheds what falls on it, and none of it is lost on the way.
        const laid = grid.rainOn(0, 0, undefined, 4);
        grid.setBalls([{ x: 160, y: 160, radiusPx: 32 }]);
        expect(grid.totalPx()).toBeCloseTo(laid, 3);
    });

    for (const [name, input] of MODES) {
        describe(`in ${name}`, () => {
            it("pushes away the volume of its lower half when it is half in the water (Archimedes)", () => {
                const grid = lake(-100, 0);
                const total = grid.totalPx();
                const held = { x: MIDDLE, y: MIDDLE, radiusPx: 64 };
                const { ball, lostPx } = run(grid, input, 700, { ...held, radiusPx: 0 }, () => held);
                expect(ball).toEqual(held);
                expect(lostPx).toBe(0);
                expect(grid.totalPx() / total).toBeCloseTo(1, 5);
                // The open water holds what the lower half of the ball pushed away. The water that went up wets
                // a little more of the ball: within a twentieth.
                const hemisphere = cellsOf(held, (half) => half);
                expect(hemisphere / (((2 / 3) * Math.PI * 64 ** 3) / TERRAIN_CELL ** 2)).toBeCloseTo(1, 2);
                const { gained, open } = openWater(grid, 100);
                expect(gained).toBeGreaterThan(hemisphere * 0.98);
                expect(gained).toBeLessThan(hemisphere * 1.05);
                expect(LAKE_CELLS - open).toBe(cellsOf(held, (half) => (half > 0 ? 1 : 0)));
                // And no water is left on the ball: it stands out of the lake.
                expect(grid.depthAt(SIDE / 2, SIDE / 2)).toBe(0);
            });

            it("pushes away all its volume when it is under the water", () => {
                const grid = lake(-100, 90);
                const total = grid.totalPx();
                const held = { x: MIDDLE, y: MIDDLE, radiusPx: 32 };
                const { lostPx } = run(grid, input, 700, { ...held, radiusPx: 0 }, () => held);
                expect(lostPx).toBe(0);
                expect(grid.totalPx() / total).toBeCloseTo(1, 5);
                // The surface of the lake, the water over the ball included, went up by the volume of the ball.
                const sphere = cellsOf(held, (half) => 2 * half);
                let surface = 0;
                for (let y = BANK; y < SIDE - BANK; y++) {
                    for (let x = BANK; x < SIDE - BANK; x++) {
                        surface += grid.depthAt(x, y) + (grid.ballAt(x, y) ? ballHalfHeight(held, x, y) : -100);
                    }
                }
                expect((surface - 90 * LAKE_CELLS) / sphere).toBeCloseTo(1, 2);
                // The water stands over its top.
                expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(true);
                expect(grid.depthAt(SIDE / 2, SIDE / 2)).toBeGreaterThan(50);
            });

            it("makes no water and loses none while it comes, is dragged, grows and goes", () => {
                const grid = lake(-60, -10);
                const total = grid.totalPx();
                let ball: WaterBall = { x: MIDDLE - 200, y: MIDDLE, radiusPx: 0 };
                let lostPx = 0;
                const stages: ((step: number) => WaterBall | undefined)[] = [
                    () => ({ x: MIDDLE - 200, y: MIDDLE, radiusPx: 64 }),
                    () => ({ x: MIDDLE + 200, y: MIDDLE + 100, radiusPx: 64 }),
                    () => ({ x: MIDDLE + 200, y: MIDDLE + 100, radiusPx: 160 }),
                    () => undefined,
                ];
                for (const held of stages) {
                    const stage = run(grid, input, 80, ball, held);
                    ball = stage.ball;
                    lostPx += stage.lostPx;
                    expect(stage.finite).toBe(true);
                    expect(grid.totalPx() / total).toBeCloseTo(1, 5);
                }
                expect(ball.radiusPx).toBe(0);
                expect(lostPx).toBe(0);
            });

            it("lets the water come back by itself once it is gone", () => {
                const grid = lake(-60, -10);
                const held = { x: MIDDLE, y: MIDDLE, radiusPx: 96 };
                run(grid, input, 60, { ...held, radiusPx: 0 }, () => held);
                // The ball rests on the bed of the lake: no water is left where it stands.
                expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(true);
                expect(grid.depthAt(SIDE / 2, SIDE / 2)).toBe(0);
                run(grid, input, 1500, held, () => undefined);
                expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(false);
                for (const [x, y] of [
                    [SIDE / 2, SIDE / 2],
                    [BANK + 1, BANK + 1],
                    [SIDE - BANK - 2, SIDE / 2],
                ]) {
                    expect(Math.abs(grid.depthAt(x, y) - 50)).toBeLessThan(2);
                }
            });

            it("stays within bounds at its largest, dragged as fast as it goes", () => {
                const grid = lake(-60, 0);
                const total = grid.totalPx();
                // The pointer leaps from a side of the lake to the other every second: the ball goes after it.
                const stage = run(grid, input, 300, { x: MIDDLE, y: MIDDLE, radiusPx: 0 }, (step) => ({
                    x: Math.floor(step / 10) % 2 === 0 ? 200 : SIDE * TERRAIN_CELL - 200,
                    y: MIDDLE,
                    radiusPx: 256,
                }));
                expect(stage.finite).toBe(true);
                expect(stage.lostPx).toBe(0);
                expect(grid.totalPx() / total).toBeCloseTo(1, 5);
                // The lake is 60 px deep: the wave a ball that slow pushes stays of the order of the lake.
                expect(stage.highest).toBeLessThan(60 + 250);
            });

            it("keeps the water of two balls that overlap", () => {
                const grid = lake(-60, -10);
                const total = grid.totalPx();
                const first = { x: MIDDLE - 40, y: MIDDLE, radiusPx: 64 };
                const second = { x: MIDDLE + 40, y: MIDDLE + 10, radiusPx: 96 };
                for (let step = 0; step < 100; step++) {
                    const radius = Math.min(1, step / 20);
                    grid.setBalls([
                        { ...first, radiusPx: first.radiusPx * radius },
                        { ...second, radiusPx: second.radiusPx * radius, x: second.x - step },
                    ]);
                    expect(grid.step(input).lostPx).toBe(0);
                }
                expect(grid.totalPx() / total).toBeCloseTo(1, 5);
                grid.setBalls([]);
                expect(grid.totalPx() / total).toBeCloseTo(1, 5);
            });
        });
    }

    it("pushes a higher wave the faster it comes", () => {
        const crest = (seconds: number): number => {
            const grid = lake(-60, 0);
            let highest = 0;
            for (let step = 0; step <= seconds * 10; step++) {
                grid.setBalls([{ x: MIDDLE, y: MIDDLE, radiusPx: (96 * step) / (seconds * 10) }]);
                grid.step(inertia);
                for (let x = BANK; x < SIDE - BANK; x++) {
                    if (!grid.ballAt(x, SIDE / 2)) highest = Math.max(highest, grid.depthAt(x, SIDE / 2) - 60);
                }
            }
            return highest;
        };
        const slow = crest(6);
        const fast = crest(1.5);
        expect(slow).toBeGreaterThan(1);
        expect(fast).toBeGreaterThan(slow * 2);
    });

    it("holds water under itself in a deep lake, which a save keeps and a new grid takes", () => {
        const grid = lake(-100, 0);
        const total = grid.totalPx();
        const ball = { x: MIDDLE, y: MIDDLE, radiusPx: 64 };
        grid.setBalls([ball]);
        // Under the middle of the ball: its top is the ground of the water, and what is under it is not seen.
        expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(true);
        expect(grid.depthAt(SIDE / 2, SIDE / 2)).toBe(0);
        expect(grid.totalPx() / total).toBeCloseTo(1, 6);
        const seen = grid.writeDepths();
        const whole = grid.writeDepths(true);
        const at = ((SIDE / 2) * SIDE + SIDE / 2) * 2;
        expect(seen[at] | (seen[at + 1] << 8)).toBe(0);
        const under = (whole[at] | (whole[at + 1] << 8)) / 8;
        expect(under).toBeCloseTo(100 - ballHalfHeight(ball, SIDE / 2, SIDE / 2), 0);
        // A map that was edited: the new grid has all the water, the ball is put back at its next step.
        const cells = new Map<string, number>();
        for (let y = 0; y < SIDE; y++)
            for (let x = 0; x < SIDE; x++) cells.set(cellKey(x, y), inLake(x, y) ? -100 : 250);
        const next = new WaterGrid(withHeights(undefined, cells), { x: 0, y: 0, width: SIDE, height: SIDE });
        next.takeFrom(grid);
        expect(next.totalPx() / total).toBeCloseTo(1, 6);
        // Depths read again are those of a map without ball.
        expect(grid.readDepths(whole)).toBe(true);
        expect(grid.ballAt(SIDE / 2, SIDE / 2)).toBe(false);
        expect(grid.totalPx() / total).toBeCloseTo(1, 3);
    });
});
