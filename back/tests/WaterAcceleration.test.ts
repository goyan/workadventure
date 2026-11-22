import type { SubToPusherRoomMessage, TerrainWaterMessage } from "@workadventure/messages";
import type { TerrainData, WAMFileFormat, WaterGrid, WaterSettings } from "@workadventure/map-editor";
import {
    CELL_LITRES_PER_PX,
    cellKey,
    DEFAULT_WATER_SETTINGS,
    TERRAIN_CELL,
    TILE_PX,
    WeatherType,
    withHeights,
} from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import { TerrainWaterManager } from "../src/Model/TerrainWaterManager";

/**
 * The three scenarios of the study of the water of the server (etude-eau-serveur, report A): a basin that fills and
 * spills, a lake that empties over a sill, a river down a slope. Each is lived in the time of its map at the pace of
 * reality, then faster: the probes must agree, minute after minute.
 */
const WALL = 60;
interface Scenario {
    width: number;
    height: number;
    minutes: number;
    ground: (x: number, y: number) => number;
    full?: (x: number, y: number) => number;
    /** A source: cell, pixels of water a second (over one cell: CELL_LITRES_PER_PX litres each), radius in cells. */
    source?: { x: number; y: number; pxPerSecond: number; radius: number };
    probes: (grid: WaterGrid) => number[];
}
const SCENARIOS: Record<"basin" | "sill" | "river", Scenario> = {
    basin: {
        width: 100,
        height: 50,
        minutes: 20,
        // A basin of 30 by 30 cells, 40 px deep, in a walled yard open on its east edge.
        ground: (x, y) => (y < 2 || y >= 48 || x < 2 ? WALL : x >= 10 && x < 40 && y >= 10 && y < 40 ? -40 : 0),
        source: { x: 25, y: 25, pxPerSecond: 30, radius: 3 },
        probes: (grid) => [grid.depthAt(12, 12) - 40, grid.depthAt(70, 25), grid.depthAt(25, 25) - 40],
    },
    sill: {
        width: 100,
        height: 40,
        minutes: 20,
        // A lake full to its rim behind a wall with a notch of 4 cells, its sill 10 px under the level; open east.
        ground: (x, y) =>
            y < 2 || y >= 38 || x < 2 ? WALL : x >= 45 && x < 50 ? (y >= 18 && y < 22 ? -10 : WALL) : -40,
        full: (x, y) => (x >= 2 && x < 45 && y >= 2 && y < 38 ? 40 : 0),
        probes: (grid) => [grid.depthAt(10, 20) - 40, grid.depthAt(47, 20), grid.depthAt(80, 20)],
    },
    river: {
        width: 200,
        height: 16,
        minutes: 30,
        // A channel 8 cells wide down 0.1 px a cell, a source at its top, open at its east end.
        ground: (x, y) => (y < 4 || y >= 12 || x < 2 ? WALL : -0.1 * x),
        source: { x: 6, y: 8, pxPerSecond: 20, radius: 3 },
        probes: (grid) => [grid.depthAt(50, 8), grid.depthAt(100, 8), grid.depthAt(150, 8)],
    },
};

function relief(scenario: Scenario): TerrainData {
    const heights = new Map<string, number>();
    for (let y = 0; y < scenario.height; y++)
        for (let x = 0; x < scenario.width; x++) {
            const height = scenario.ground(x, y);
            if (height !== 0) heights.set(cellKey(x, y), height);
        }
    return withHeights(undefined, heights);
}

function room(scenario: Scenario, water: Partial<WaterSettings>) {
    const cellsPerTile = TILE_PX / TERRAIN_CELL;
    const source = scenario.source;
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: source
            ? {
                  spring: {
                      x: source.x * TERRAIN_CELL + TERRAIN_CELL / 2,
                      y: source.y * TERRAIN_CELL + TERRAIN_CELL / 2,
                      prefabRef: { collectionName: "eau", id: "x" },
                      properties: [
                          {
                              id: "s",
                              type: "waterSourcePropertyData" as const,
                              flow: source.pxPerSecond * 60 * CELL_LITRES_PER_PX,
                              radius: source.radius / cellsPerTile,
                          },
                      ],
                  },
              }
            : {},
        settings: {
            weather: WeatherType.Clear,
            water: { ...DEFAULT_WATER_SETTINGS, evaporation: 0, absorption: 0, indoorDrain: 0, runoff: 0, ...water },
        },
        terrain: relief(scenario),
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
        () => ({ width: scenario.width, height: scenario.height }),
        () => time.ms,
    );
    manager.mapChanged();
    const grid = manager.getGrid();
    if (!grid) throw new Error("no grid");
    if (scenario.full) {
        const bytes = new Uint8Array(grid.writeDepths().length);
        for (let y = 0; y < scenario.height; y++)
            for (let x = 0; x < scenario.width; x++) {
                const eighths = Math.round(scenario.full(x, y) * 8);
                const at = ((y - grid.bounds.y) * grid.bounds.width + (x - grid.bounds.x)) * 2;
                if (at < 0 || at >= bytes.length) continue;
                bytes[at] = eighths & 255;
                bytes[at + 1] = eighths >> 8;
            }
        grid.readDepths(bytes);
    }
    return { manager, grid, time, sent };
}

/** The probes at each minute of the time of the map, and the real steps it took. */
function live(scenario: Scenario, water: Partial<WaterSettings>, costMs = 0) {
    const { manager, grid, time, sent } = room(scenario, water);
    const step = grid.step.bind(grid);
    grid.step = (input) => {
        time.ms += costMs;
        return step(input);
    };
    const minutes: number[][] = [];
    let lived = 0;
    let realSteps = 0;
    while (minutes.length < scenario.minutes) {
        manager.step();
        realSteps++;
        lived += manager.livedTimes().flow;
        // A minute of the time of the map is 600 of its steps: probed as soon as it is lived.
        while (lived >= (minutes.length + 1) * 600 && minutes.length < scenario.minutes)
            minutes.push(scenario.probes(grid));
    }
    return { minutes, realSteps, manager, sent, grid };
}

describe("a map whose water goes faster than reality lives the water of reality", () => {
    for (const [name, scenario] of Object.entries(SCENARIOS)) {
        for (const speed of [6, 20]) {
            it(`${name} at ×${speed}: the probes within 1.5 px all along, 0.5 px at the end`, () => {
                const reference = live(scenario, { speed: 1 });
                const fast = live(scenario, { speed });
                expect(fast.realSteps).toBeLessThan(reference.realSteps / (speed / 2));
                let worst = 0;
                for (let minute = 0; minute < scenario.minutes; minute++)
                    for (let probe = 0; probe < 3; probe++)
                        worst = Math.max(
                            worst,
                            Math.abs(fast.minutes[minute][probe] - reference.minutes[minute][probe]),
                        );
                expect(worst).toBeLessThan(1.5);
                const last = scenario.minutes - 1;
                for (let probe = 0; probe < 3; probe++)
                    expect(Math.abs(fast.minutes[last][probe] - reference.minutes[last][probe])).toBeLessThan(0.5);
            }, 60_000);
        }
    }
});

describe("how fast what comes in goes", () => {
    it("never faster than the water is computed on the server: as fast as it holds", () => {
        // 5 ms a step of the time of the map: no more than three of them in the 15 ms the server gives.
        const { manager, sent } = live({ ...SCENARIOS.basin, minutes: 1 }, { speed: 60 }, 5);
        expect(manager.livedTimes().flow).toBeLessThanOrEqual(3);
        expect(manager.livedTimes().inflow).toBe(manager.livedTimes().flow);
        expect(sent.at(-1)?.stats?.reachedSpeed).toBe(manager.livedTimes().flow);
    });

    it("as fast as asked for a player's own water, its flow as fast as the machine holds", () => {
        const { manager, grid, time } = room(SCENARIOS.basin, { speed: 1 });
        manager.inflowAt("asked");
        manager.askWith(() => 60);
        const step = grid.step.bind(grid);
        grid.step = (input) => {
            time.ms += 5;
            return step(input);
        };
        const before = grid.totalPx();
        for (let real = 0; real < 10; real++) manager.step();
        expect(manager.livedTimes().inflow).toBe(60);
        expect(manager.livedTimes().flow).toBeLessThanOrEqual(3);
        // A second of the real clock: sixty seconds of the source, all of it in the basin.
        const poured = (SCENARIOS.basin.source?.pxPerSecond ?? 0) * 60;
        expect((grid.totalPx() - before) / poured).toBeCloseTo(1, 1);
    });

    it("tells how fast the currents go when a player asks for fast water on a map at the pace of reality", () => {
        const { manager, sent } = room(SCENARIOS.basin, { speed: 1 });
        manager.inflowAt("asked");
        manager.askWith(() => 60);
        for (let real = 0; real < 20; real++) manager.step();
        expect(sent.at(-1)?.stats?.reachedSpeed).toBe(manager.livedTimes().flow);
    });

    it("at the pace of reality on a map that says nothing: one step of its time a real step", () => {
        const { manager, sent } = room(SCENARIOS.basin, {});
        for (let real = 0; real < 20; real++) manager.step();
        expect(manager.livedTimes()).toEqual({ inflow: 1, flow: 1 });
        expect(sent.at(-1)?.stats?.reachedSpeed).toBeUndefined();
    });
});
