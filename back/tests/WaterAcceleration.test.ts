import type { SubToPusherRoomMessage, TerrainWaterMessage } from "@workadventure/messages";
import type { TerrainData, WAMFileFormat, WaterSettings } from "@workadventure/map-editor";
import {
    CELL_LITRES_PER_PX,
    cellKey,
    DEFAULT_WATER_SETTINGS,
    WeatherType,
    withHeights,
} from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { TerrainWaterManager } from "../src/Model/TerrainWaterManager";

/** The three scenarios of the water, each on a relief of its own (cells, height in pixels of water). */
function relief(kind: "overflow" | "sill" | "river"): TerrainData {
    const heights = new Map<string, number>();
    for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 60; x++) {
            let height = 40;
            if (kind === "overflow") {
                // A basin of 12 by 12 cells, 16 px deep, in a plain a little lower than its rim.
                height = x >= 4 && x < 16 && y >= 4 && y < 16 ? -16 : x < 2 || y < 2 || x >= 58 || y >= 28 ? 40 : 0;
            } else if (kind === "sill") {
                // A lake 32 px deep behind a sill 8 px under its rim, then a slope down to the edge of the map.
                if (y >= 10 && y < 20 && x >= 2 && x < 20) height = -32;
                else if (y >= 13 && y < 17 && x >= 20 && x < 22) height = -8;
                else if (y >= 13 && y < 17 && x >= 22) height = -8 - (x - 22);
            } else {
                // A river: a channel 4 cells wide going down 1 px every 2 cells, open at its lower end.
                if (y >= 13 && y < 17) height = 40 - Math.floor(x / 2);
            }
            heights.set(cellKey(x, y), height);
        }
    }
    return withHeights(undefined, heights);
}

const source = (x: number, y: number, flow: number) => ({
    x: x * 16 + 8,
    y: y * 16 + 8,
    prefabRef: { collectionName: "eau", id: "x" },
    properties: [{ id: "s", type: "waterSourcePropertyData" as const, flow }],
});

function room(kind: "overflow" | "sill" | "river", water: Partial<WaterSettings>) {
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities:
            kind === "overflow"
                ? { spring: source(10, 10, 12000) }
                : kind === "river"
                  ? { spring: source(1, 15, 3000) }
                  : {},
        settings: {
            weather: WeatherType.Clear,
            water: { ...DEFAULT_WATER_SETTINGS, evaporation: 0, absorption: 0, indoorDrain: 0, ...water },
        },
        terrain: relief(kind),
    };
    const sent: TerrainWaterMessage[] = [];
    const time = { ms: 0 };
    const manager = new TerrainWaterManager(
        {
            getWam: () => wam,
            sendSubMessageToRoom: (message: SubToPusherRoomMessage): void => {
                if (message.message?.$case === "terrainWaterMessage") sent.push(message.message.terrainWaterMessage);
            },
        },
        { slotsFor: () => undefined },
        undefined,
        () => Date.UTC(2026, 6, 14, 12),
        () => ({ width: 60, height: 30 }),
        () => time.ms,
    );
    manager.mapChanged();
    const grid = manager.getGrid();
    if (!grid) throw new Error("no grid");
    if (kind === "sill") {
        // The lake full to its rim.
        const bytes = new Uint8Array(grid.writeDepths().length);
        for (let y = 10; y < 20; y++)
            for (let x = 2; x < 20; x++)
                bytes[((y - grid.bounds.y) * grid.bounds.width + (x - grid.bounds.x)) * 2] = 255;
        grid.readDepths(bytes);
    }
    return { manager, grid, time, sent };
}

/** Lives `seconds` of the time of the map, as many real steps as it takes: the water, and the real steps taken. */
function live(kind: "overflow" | "sill" | "river", water: Partial<WaterSettings>, seconds: number, costMs = 0) {
    const { manager, grid, time, sent } = room(kind, water);
    // Each step of the time of the map costs `costMs` on the clock of the server.
    const step = grid.step.bind(grid);
    grid.step = (input) => {
        time.ms += costMs;
        return step(input);
    };
    let lived = 0;
    let realSteps = 0;
    while (lived < seconds * 10 && realSteps < 100_000) {
        manager.step();
        lived += manager.livedTimes().flow;
        realSteps++;
    }
    return { grid, lived, realSteps, sent, manager };
}

const stock = (grid: { totalPx(): number }): number => (grid.totalPx() * CELL_LITRES_PER_PX) / 1000;

describe("a map whose water goes faster than reality", () => {
    for (const kind of ["overflow", "sill", "river"] as const) {
        it(`lives the same water as reality in less real time (${kind})`, () => {
            // Four minutes of the time of the map: the basin full and spilling on the plain, the lake down to its
            // sill, the river run down its channel.
            const reference = live(kind, { speed: 1 }, 240);
            const fast = live(kind, { speed: 20 }, 240);
            expect(fast.realSteps).toBeLessThan(reference.realSteps / 5);
            // The fineness falls to 1 while it goes fast: the same volume, the same wet ground, within a few percent.
            expect(Math.abs(stock(fast.grid) - stock(reference.grid))).toBeLessThan(0.03 * stock(reference.grid));
            expect(Math.abs(fast.grid.wetCells() - reference.grid.wetCells())).toBeLessThan(
                0.03 * reference.grid.wetCells(),
            );
        });
    }

    it("never lets what comes in go faster than the water is computed: as fast as the server holds", () => {
        // 20 ms a step of the time of the map: no more than two of them in the half of a real step of 100 ms.
        const { manager, realSteps, sent } = live("overflow", { speed: 60 }, 30, 20);
        expect(manager.livedTimes().flow).toBeLessThanOrEqual(2);
        expect(manager.livedTimes().inflow).toBe(manager.livedTimes().flow);
        // The room is told how fast the water really goes.
        const told = sent.at(-1)?.stats?.reachedSpeed;
        expect(told).toBe(manager.livedTimes().flow);
        expect(realSteps).toBeGreaterThan(150);
    });

    it("lets a player's own water take in what comes as fast as asked, its flow as fast as the machine holds", () => {
        const { manager, grid, time } = room("overflow", { speed: 1 });
        manager.inflowAt("asked");
        manager.askWith(() => 60);
        const step = grid.step.bind(grid);
        grid.step = (input) => {
            time.ms += 20;
            return step(input);
        };
        for (let real = 0; real < 10; real++) manager.step();
        expect(manager.livedTimes().inflow).toBe(60);
        expect(manager.livedTimes().flow).toBeLessThanOrEqual(2);
        // A second of the real clock: sixty seconds of the source (12 000 litres a minute): 12 m³.
        expect(stock(grid)).toBeCloseTo(12, 0);
    });

    it("goes at the pace of reality on a map that says nothing: one step of its time a real step", () => {
        const { manager, sent } = room("overflow", {});
        for (let real = 0; real < 20; real++) manager.step();
        expect(manager.livedTimes()).toEqual({ inflow: 1, flow: 1 });
        expect(sent.at(-1)?.stats?.reachedSpeed).toBeUndefined();
    });
});
