import { afterEach, describe, expect, it } from "vitest";
import { cellKey, DEFAULT_WATER_SETTINGS, WATER_STEP_MS, WaterSimulation, WeatherType, withHeights } from "../src";
import type { WAMFileFormat, WaterSettings } from "../src";

/**
 * Rooms that share the thread of the server: the time their water takes adds up (WaterLoads). A room whose map goes
 * faster than reality may only take what the others leave, under the share from which they would ease.
 */
const MAP_CELLS = { width: 24, height: 16 };
const heights = new Map<string, number>();
for (let y = 2; y < 14; y++) for (let x = 2; x < 22; x++) heights.set(cellKey(x, y), -32);

/** A room whose steps of the time of its map cost `costMs` each on its clock. */
function room(water: Partial<WaterSettings>, costMs: number) {
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {
            spring: {
                x: 40,
                y: 40,
                prefabRef: { collectionName: "eau", id: "x" },
                properties: [{ id: "s", type: "waterSourcePropertyData", flow: 3000 }],
            },
        },
        settings: { weather: WeatherType.Clear, water: { ...DEFAULT_WATER_SETTINGS, ...water } },
        terrain: withHeights(undefined, heights),
    };
    const time = { ms: 0, spent: 0 };
    const eased: (number | undefined)[] = [];
    const simulation = new WaterSimulation(
        {
            getWam: () => wam,
            sendSubMessageToRoom: (message) => {
                if (message.message?.$case === "terrainWaterMessage")
                    eased.push(message.message.terrainWaterMessage.stats?.easedPrecision);
            },
        },
        { slotsFor: () => undefined },
        (bytes) => bytes,
        () => Date.UTC(2026, 10, 22, 12),
        () => MAP_CELLS,
        () => time.ms,
    );
    simulation.mapChanged();
    const grid = simulation.getGrid();
    if (!grid) throw new Error("no grid");
    const step = grid.step.bind(grid);
    grid.step = (input) => {
        time.ms += costMs;
        time.spent += costMs;
        return step(input);
    };
    return { simulation, time, eased };
}

const rooms: WaterSimulation[] = [];
afterEach(() => {
    for (const simulation of rooms.splice(0)) simulation.stop();
});

/** Steps the rooms one after the other, as the thread does: the time they took together at the last step (ms). */
function live(steps: number, ...all: ReturnType<typeof room>[]): number {
    rooms.push(...all.map((one) => one.simulation));
    let together = 0;
    for (let step = 0; step < steps; step++) {
        together = 0;
        for (const one of all) {
            const before = one.time.spent;
            one.simulation.step();
            together += one.time.spent - before;
        }
    }
    return together;
}

describe("a map faster than reality beside other rooms of the thread", () => {
    it("takes its whole budget alone", () => {
        const fast = room({ speed: 60, inertia: false }, 2);
        live(100, fast);
        // 15 ms a real step, 2 ms a step of the time of its map: seven at most; it climbs while under half of it.
        expect(fast.simulation.livedTimes().flow).toBeGreaterThanOrEqual(4);
        expect(fast.simulation.livedTimes().flow).toBeLessThanOrEqual(7);
    });

    it("takes only what a room at the pace of reality leaves, under the share where the waters ease", () => {
        const slow = room({ speed: 1, inertia: true, precision: 3 }, 20);
        const fast = room({ speed: 60, inertia: false }, 2);
        const together = live(200, slow, fast);
        // The thread eases its waters over half the time between two steps, gives back under a quarter (25 ms):
        // the room at 20 ms leaves 5 ms, two steps of the fast one.
        expect(fast.simulation.livedTimes().flow).toBeLessThanOrEqual(2);
        expect(together).toBeLessThanOrEqual(WATER_STEP_MS / 4);
        expect(slow.eased.filter((value) => value !== undefined)).toEqual([]);
    });

    it("lives at the pace of reality while the others already hold the thread, and never makes them ease", () => {
        const slow = room({ speed: 1, inertia: true, precision: 3 }, 40);
        const fast = room({ speed: 60, inertia: false }, 5);
        const together = live(200, slow, fast);
        expect(fast.simulation.livedTimes().flow).toBe(1);
        expect(together).toBeLessThan(WATER_STEP_MS / 2);
        expect(slow.eased.filter((value) => value !== undefined)).toEqual([]);
    });
});
