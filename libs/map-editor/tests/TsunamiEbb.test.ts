import { describe, expect, it } from "vitest";
import { SubToPusherRoomMessage } from "@workadventure/messages";
import { TSUNAMI_BACKWASH_MS, tsunamiSea } from "../src/Catastrophe/Tsunami";
import type { Tsunami } from "../src/Catastrophe/Tsunami";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { WaterGrid } from "../src/Terrain/WaterGrid";
import { threadWaterLoads } from "../src/Terrain/WaterLoad";
import { WATER_STEP_MS } from "../src/Terrain/WaterInputs";
import { WaterSimulation } from "../src/Terrain/WaterSimulation";
import { DEFAULT_WATER_SETTINGS } from "../src/types";
import type { WAMFileFormat } from "../src/types";

/**
 * A strip of coast 160 cells long and 7 wide, banked high all round but at its east end (the coast, the last column
 * of the grid): a plain at the altitude 0 with, from the west, a lake full to its rim (2.2 m), a pond half full
 * (1.1 m of water in 2.2 m) and a hollow of the plain, dry. The water of the map, nothing else: no rain, no
 * evaporation, no ground that drinks, no drain. What the map holds before the tsunami is what it must hold after.
 */
const WIDTH = 160;
const HEIGHT = 9;
const BANK_PX = 256;
const LAKE = { from: 40, to: 70, groundPx: -64, waterPx: 64 };
const POND = { from: 80, to: 95, groundPx: -64, waterPx: 32 };
const HOLLOW = { from: 110, to: 125, groundPx: -32, waterPx: 0 };
const BASINS = [LAKE, POND, HOLLOW];

function coastHeights(): Map<string, number> {
    const heights = new Map<string, number>();
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const banked = y === 0 || y === HEIGHT - 1 || x === 0;
            const basin = BASINS.find((one) => x >= one.from && x < one.to);
            if (banked) heights.set(cellKey(x, y), BANK_PX);
            else if (basin) heights.set(cellKey(x, y), basin.groundPx);
        }
    }
    return heights;
}

/** The depths of the basins before the tsunami, as WaterGrid.readDepths reads them: eighths of a pixel, low byte first. */
function basinDepths(): Uint8Array {
    const bytes = new Uint8Array(WIDTH * HEIGHT * 2);
    for (const basin of BASINS) {
        for (let y = 1; y < HEIGHT - 1; y++) {
            for (let x = basin.from; x < basin.to; x++) {
                const eighths = basin.waterPx * 8;
                const index = y * WIDTH + x;
                bytes[index * 2] = eighths & 255;
                bytes[index * 2 + 1] = eighths >> 8;
            }
        }
    }
    return bytes;
}

function coast(speed = 1) {
    const heights = coastHeights();
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: {
            water: {
                ...DEFAULT_WATER_SETTINGS,
                inertia: true,
                precision: 8,
                updates: 1,
                speed,
                evaporation: 0,
                absorption: 0,
                indoorDrain: 0,
            },
        },
        terrain: withHeights(undefined, heights),
    };
    threadWaterLoads.clear();
    let now = 1_000_000;
    const encoded: number[] = [];
    let tsunami: Tsunami | undefined;
    const simulation = new WaterSimulation(
        {
            getWam: () => wam,
            // Each message as the back sends it to the pusher: a field that cannot be encoded throws here.
            sendSubMessageToRoom: (message) => {
                encoded.push(SubToPusherRoomMessage.encode(message).finish().length);
            },
        },
        { slotsFor: () => undefined },
        (bytes) => bytes,
        () => now,
        () => ({ width: WIDTH, height: HEIGHT }),
        () => 0,
        WATER_STEP_MS,
    );
    simulation.mapChanged();
    simulation.pause();
    const grid = simulation.getGrid();
    if (!grid) throw new Error("no grid");
    expect(grid.bounds).toMatchObject({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    grid.readDepths(basinDepths());
    simulation.seaUnder(() => tsunami);
    const live = (seconds: number): void => {
        for (let step = 0; step < (seconds * 1000) / WATER_STEP_MS; step++) {
            simulation.step();
            now += WATER_STEP_MS;
        }
    };
    return {
        grid,
        simulation,
        live,
        encoded,
        now: () => now,
        send: (sent: Tsunami | undefined) => {
            tsunami = sent;
        },
    };
}

/** The water of a basin (pixels over a cell), and the lowest depth of its cells. */
function basinOf(grid: WaterGrid, basin: (typeof BASINS)[number]): { totalPx: number; lowestPx: number } {
    let totalPx = 0;
    let lowestPx = Infinity;
    for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = basin.from; x < basin.to; x++) {
            const depth = grid.depthAt(x, y);
            totalPx += depth;
            lowestPx = Math.min(lowestPx, depth);
        }
    }
    return { totalPx, lowestPx };
}

/** What the basins held before the tsunami: their cells times the water put in each. */
const basinBefore = (basin: (typeof BASINS)[number]): number => (basin.to - basin.from) * (HEIGHT - 2) * basin.waterPx;
const BEFORE_PX = BASINS.reduce((sum, basin) => sum + basinBefore(basin), 0);

describe("the water a tsunami left, taken away once its sea is down", () => {
    it("brings the map back to the water it held before, within 1 %, over the backwash", () => {
        const { grid, live, send, now } = coast();
        live(5);
        expect(grid.totalPx()).toBeCloseTo(BEFORE_PX, 0);
        const tsunami: Tsunami = { id: 1, startedAt: now(), metres: 3, durationMs: 60_000 };
        send(tsunami);
        live(60);
        // At the end of the crest the sea brought several times what the map held, and filled the dry hollow.
        expect(grid.totalPx()).toBeGreaterThan(2 * BEFORE_PX);
        expect(basinOf(grid, HOLLOW).totalPx).toBeGreaterThan((HOLLOW.to - HOLLOW.from) * (HEIGHT - 2) * 32);
        const flood = grid.seaFlood();
        expect(flood?.beforePx).toBeCloseTo(BEFORE_PX, 0);
        live(TSUNAMI_BACKWASH_MS / 1000);
        send(undefined);
        // Once the backwash is over, nothing more is followed: the map holds what it held before.
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
        live(30);
        expect(grid.seaFlood()).toBeUndefined();
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
        // The dry hollow the sea filled is dry again: less than 1 % of what it holds full.
        expect(basinOf(grid, HOLLOW).totalPx).toBeLessThan(0.01 * (HOLLOW.to - HOLLOW.from) * (HEIGHT - 2) * 32);
    });

    it("never takes the water the map held before: its lake full, its pond half full, as they were", () => {
        const { grid, live, send, now } = coast();
        live(5);
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 60_000 });
        live(60);
        // Under the sea the lake and the pond are over their level.
        expect(basinOf(grid, POND).totalPx).toBeGreaterThan(1.5 * basinBefore(POND));
        let taken = 0;
        let brought = 0;
        for (let second = 0; second < TSUNAMI_BACKWASH_MS / 1000; second++) {
            live(1);
            const flood = grid.seaFlood();
            taken = flood?.takenPx ?? taken;
            brought = flood ? flood.inPx - flood.outPx : brought;
        }
        send(undefined);
        live(30);
        // What was taken away is no more than what the sea brought and did not take back.
        expect(taken).toBeGreaterThan(0);
        expect(taken).toBeLessThanOrEqual(brought);
        for (const basin of [LAKE, POND]) {
            const after = basinOf(grid, basin).totalPx;
            expect(after / basinBefore(basin), `basin from ${basin.from}`).toBeGreaterThan(0.99);
            expect(after / basinBefore(basin), `basin from ${basin.from}`).toBeLessThan(1.01);
        }
    });

    it("takes the water away as well when the tsunami is stopped early, its sea gone at once", () => {
        const { grid, live, send, now } = coast();
        live(5);
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 180_000 });
        live(20);
        expect(grid.totalPx()).toBeGreaterThan(1.2 * BEFORE_PX);
        // Stopped: the room forgets it (CatastropheManager.stopTsunami), the grid has no sea any more.
        send(undefined);
        live(1);
        expect(grid.seaEbbing()).toBe(true);
        live(TSUNAMI_BACKWASH_MS / 1000 + 30);
        expect(grid.seaFlood()).toBeUndefined();
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
        expect(basinOf(grid, POND).totalPx / basinBefore(POND)).toBeGreaterThan(0.99);
    });

    it("on a map faster than reality (>>), takes it away in the time of its water, every message encodable", () => {
        const { grid, simulation, live, send, now, encoded } = coast(4);
        live(5);
        // Four steps of its time in each real step.
        expect(simulation.livedTimes().flow).toBe(4);
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 60_000 });
        live(60);
        expect(grid.seaFlood()).toBeDefined();
        live(TSUNAMI_BACKWASH_MS / 1000);
        send(undefined);
        live(10);
        expect(grid.seaFlood()).toBeUndefined();
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
        expect(basinOf(grid, LAKE).totalPx / basinBefore(LAKE)).toBeGreaterThan(0.99);
        expect(encoded.length).toBeGreaterThan(10);
    });

    it("starts again from the state before the first when a second crest comes during the ebb", () => {
        const { grid, live, send, now } = coast();
        live(5);
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 30_000 });
        live(40);
        expect(grid.seaEbbing()).toBe(true);
        // A second tsunami, launched while the water of the first is taken away.
        send({ id: 2, startedAt: now(), metres: 2, durationMs: 30_000 });
        live(1);
        expect(grid.seaEbbing()).toBe(false);
        expect(grid.seaFlood()?.beforePx).toBeCloseTo(BEFORE_PX, 0);
        live(30 + TSUNAMI_BACKWASH_MS / 1000);
        send(undefined);
        live(10);
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
    });

    it("leaves what a river brought meanwhile: the map goes back to what it would hold had no tsunami come", () => {
        // A source pours 1 px a step (10 px a second) into the pond, before, during and after the tsunami.
        const grid = new WaterGrid(withHeights(undefined, coastHeights()), {
            x: 0,
            y: 0,
            width: WIDTH,
            height: HEIGHT,
        });
        grid.readDepths(basinDepths());
        const input = {
            rainPx: 0,
            evaporationPx: 0,
            absorptionPx: 0,
            flows: [{ cellX: 87, cellY: 4, px: 1 }],
            inertia: true,
            seconds: 0.1,
            waves: { roughness: 1, damping: 0.01, breaking: 1, momentum: 1 },
            moves: 8,
            pace: 1,
        };
        const start = grid.totalPx();
        const tsunami: Tsunami = { id: 1, startedAt: 40_000, metres: 3, durationMs: 60_000 };
        let steps = 0;
        for (; steps * 100 < 40_000 + 60_000 + TSUNAMI_BACKWASH_MS + 10_000; steps++) {
            grid.setSea(tsunamiSea(tsunami, steps * 100));
            grid.step(input);
        }
        expect(grid.seaFlood()).toBeUndefined();
        // What the source poured stays: 1 px a step, every step.
        const expected = start + steps;
        expect(Math.abs(grid.totalPx() - expected) / expected).toBeLessThan(0.01);
    });

    it("keeps following a tsunami when the map is edited and its grid made again (takeFrom)", () => {
        const make = (): WaterGrid =>
            new WaterGrid(withHeights(undefined, coastHeights()), { x: 0, y: 0, width: WIDTH, height: HEIGHT });
        let grid = make();
        grid.readDepths(basinDepths());
        const input = {
            rainPx: 0,
            evaporationPx: 0,
            absorptionPx: 0,
            flows: [],
            inertia: true,
            seconds: 0.1,
            waves: { roughness: 1, damping: 0.01, breaking: 1, momentum: 1 },
            moves: 8,
            pace: 1,
        };
        const tsunami: Tsunami = { id: 1, startedAt: 0, metres: 3, durationMs: 60_000 };
        for (let step = 1; step * 100 < 60_000 + TSUNAMI_BACKWASH_MS + 10_000; step++) {
            // Edited during the crest, then during the backwash: a new grid takes the water of the last.
            if (step === 300 || step === 900) {
                const edited = make();
                edited.takeFrom(grid);
                grid = edited;
            }
            grid.setSea(tsunamiSea(tsunami, step * 100));
            grid.step(input);
        }
        expect(grid.seaFlood()).toBeUndefined();
        expect(Math.abs(grid.totalPx() - BEFORE_PX) / BEFORE_PX).toBeLessThan(0.01);
    });

    it("leaves the lake the water a ball held under itself before the tsunami, as without a tsunami", () => {
        // The same lake twice, a ball floating in its middle (map pixels, 16 to a cell) taken out once the crest is
        // over: with a tsunami, and without (what the ball alone does to the lake, its water spilling over the rim).
        let displaced = 0;
        const lakeAfter = (sent: Tsunami | undefined): number => {
            const grid = new WaterGrid(withHeights(undefined, coastHeights()), {
                x: 0,
                y: 0,
                width: WIDTH,
                height: HEIGHT,
            });
            grid.readDepths(basinDepths());
            grid.setBalls([{ x: 55 * 16, y: 4.5 * 16, radiusPx: 40 }]);
            // The water the ball holds under itself: what it displaces.
            displaced = (Reflect.get(grid, "under") as Float32Array).reduce((sum, px) => sum + px, 0);
            const input = {
                rainPx: 0,
                evaporationPx: 0,
                absorptionPx: 0,
                flows: [],
                inertia: true,
                seconds: 0.1,
                waves: { roughness: 1, damping: 0.01, breaking: 1, momentum: 1 },
                moves: 8,
                pace: 1,
            };
            for (let step = 1; step * 100 < 60_000 + TSUNAMI_BACKWASH_MS + 30_000; step++) {
                if (step === 650) grid.setBalls([]);
                grid.setSea(tsunamiSea(sent, step * 100));
                grid.step(input);
            }
            return basinOf(grid, LAKE).totalPx;
        };
        const without = lakeAfter(undefined);
        const withTsunami = lakeAfter({ id: 1, startedAt: 0, metres: 3, durationMs: 60_000 });
        expect(displaced).toBeGreaterThan(0.05 * basinBefore(LAKE));
        // While the ball is in, the lake stands over its level before, and the ebb may take some of that: never what
        // the ball displaces (the water under it is of the lake; counted as excess, the lake lost 1.5 times that).
        expect(without - withTsunami).toBeLessThan(displaced);
    });
});
