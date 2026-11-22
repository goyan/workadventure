import type { TerrainWaterMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { cellKey, DEFAULT_WATER_SETTINGS, WATER_STEP_MS, WaterSimulation, WeatherType, withHeights } from "../src";
import type { WAMFileFormat } from "../src";

/**
 * A lake of 40 × 24 cells under a light rain, beside a spring that pours into one of its corners: the water rises a
 * little everywhere and much near the spring. At the floor of the network guard (one state a second), only the blocks
 * of the lake where the water moved by a pixel at least are told; the others wait until it has.
 */
const MAP_CELLS = { width: 48, height: 32 };
const heights = new Map<string, number>();
for (let y = 4; y < 28; y++) for (let x = 4; x < 44; x++) heights.set(cellKey(x, y), -32);
const wam: WAMFileFormat = {
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {
        spring: {
            x: 6 * 8,
            y: 6 * 8,
            prefabRef: { collectionName: "eau", id: "x" },
            properties: [{ id: "s", type: "waterSourcePropertyData", flow: 6000 }],
        },
    },
    settings: {
        weather: WeatherType.Rain,
        water: { ...DEFAULT_WATER_SETTINGS, evaporation: 0, absorption: 0, runoff: 0, inertia: false, updates: 5 },
    },
    terrain: withHeights(undefined, heights),
};

/**
 * Lives the lake for `seconds`, the map asking `updates` states a second, the network budget `sendBudget`: the states
 * told, and the true depths at each.
 */
function live(sendBudget: number, updates: number, seconds: number) {
    const map: WAMFileFormat = {
        ...wam,
        settings: { ...wam.settings, water: { ...DEFAULT_WATER_SETTINGS, ...wam.settings?.water, updates } },
    };
    const told: { message: TerrainWaterMessage; truth: Uint8Array }[] = [];
    let water: WaterSimulation | undefined = undefined;
    const simulation = new WaterSimulation(
        {
            getWam: () => map,
            sendSubMessageToRoom: (message) => {
                if (message.message?.$case !== "terrainWaterMessage") return;
                const truth = water?.getGrid()?.writeDepths() ?? new Uint8Array(0);
                told.push({ message: message.message.terrainWaterMessage, truth });
            },
        },
        { slotsFor: () => undefined },
        (bytes) => bytes,
        () => Date.UTC(2026, 10, 22, 12),
        () => MAP_CELLS,
        () => 0,
        WATER_STEP_MS,
        sendBudget,
    );
    water = simulation;
    simulation.mapChanged();
    const grid = simulation.getGrid();
    if (!grid) throw new Error("no grid");
    // The lake full to 24 px.
    const full = new Uint8Array(grid.writeDepths().length);
    for (let y = 4; y < 28; y++)
        for (let x = 4; x < 44; x++) full[((y - grid.bounds.y) * grid.bounds.width + (x - grid.bounds.x)) * 2] = 192;
    grid.readDepths(full);
    for (let step = 0; step < (seconds * 1000) / WATER_STEP_MS; step++) simulation.step();
    return { told, simulation };
}

/** The depths a player holds after each state, in eighths of a pixel: a whole state as it is, a change XORed. */
function held(told: { message: TerrainWaterMessage }[]): Uint16Array[] {
    let bytes: Uint8Array | undefined;
    return told.map(({ message }) => {
        bytes = message.full || !bytes ? Uint8Array.from(message.depths) : bytes.map((b, i) => b ^ message.depths[i]);
        const depths = new Uint16Array(bytes.length / 2);
        for (let cell = 0; cell < depths.length; cell++) depths[cell] = bytes[cell * 2] | (bytes[cell * 2 + 1] << 8);
        return depths;
    });
}
const eighths = (bytes: Uint8Array): Uint16Array => {
    const depths = new Uint16Array(bytes.length / 2);
    for (let cell = 0; cell < depths.length; cell++) depths[cell] = bytes[cell * 2] | (bytes[cell * 2 + 1] << 8);
    return depths;
};
/** How many cells a change tells (not zero in its XOR). */
const toldCells = (message: TerrainWaterMessage): number =>
    eighths(message.depths).reduce((count, value) => count + (value !== 0 ? 1 : 0), 0);

describe("the water told at the floor of the network guard", () => {
    // The map asks five states a second, the network holds next to nothing: one a second, the floor.
    const floor = live(1, 5, 30).told;
    // The map asks one state a second by itself: every cell that moved by a quarter of a pixel is told.
    const asked = live(Number.POSITIVE_INFINITY, 1, 30).told;
    const changes = (told: { message: TerrainWaterMessage }[]): number =>
        told.filter(({ message }) => !message.full).reduce((sum, { message }) => sum + toldCells(message), 0);

    it("falls to a state a second when the network is short", () => {
        expect(floor.length).toBeGreaterThan(20);
        expect(floor.length).toBeLessThanOrEqual(31);
    });

    it("tells far fewer cells than a state a second the map asks, each within a pixel of the truth", () => {
        expect(changes(asked)).toBeGreaterThan(500);
        // Measured: 314 cells told against 669 (the lake rises everywhere a little, much near its spring).
        expect(changes(floor)).toBeLessThan(changes(asked) * 0.6);
        const shown = held(floor);
        floor.forEach(({ truth }, index) => {
            const real = eighths(truth);
            for (let cell = 0; cell < real.length; cell++) {
                expect(Math.abs(shown[index][cell] - real[cell])).toBeLessThan(8);
                // Wet or dry as it really is.
                expect(shown[index][cell] === 0).toBe(real[cell] === 0);
            }
        });
    });

    it("tells a block whole: no cell of a block told is left behind, no step of a pixel inside a lake", () => {
        const shown = held(floor);
        const width = floor[0].message.width;
        floor.forEach(({ message, truth }, index) => {
            if (message.full) return;
            const change = eighths(message.depths);
            const real = eighths(truth);
            for (let by = 0; by < message.height; by += 8)
                for (let bx = 0; bx < width; bx += 8) {
                    const block: number[] = [];
                    for (let y = by; y < Math.min(by + 8, message.height); y++)
                        for (let x = bx; x < Math.min(bx + 8, width); x++) block.push(y * width + x);
                    if (!block.some((cell) => change[cell] !== 0)) continue;
                    for (const cell of block) expect(shown[index][cell]).toBe(real[cell]);
                }
        });
    });
});
