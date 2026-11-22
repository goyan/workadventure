import { cellKey, WeatherType, withHeights } from "@workadventure/map-editor";
import type { RealWeatherSlot, TerrainData, WAMFileFormat, WeatherLocation } from "@workadventure/map-editor";
import type { TerrainWaterMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";
import { LocalTerrainSimulation, localWaterSettings } from "@wa/front/Phaser/Game/Terrain/LocalTerrainSimulation";
import type { LocalTerrainTold } from "@wa/front/Phaser/Game/Terrain/LocalTerrainSimulation";

const NOW = Date.UTC(2026, 10, 22, 12, 0);
// A hollow of 3 × 3 cells, one tile deep, on a map of 4 × 4 cells.
const hollow: TerrainData = withHeights(
    undefined,
    new Map(Array.from({ length: 9 }, (_, index) => [cellKey(index % 3, Math.floor(index / 3)), -32])),
);
const MAP_CELLS = { width: 4, height: 4 };
const RIO: WeatherLocation = {
    name: "Rio de Janeiro",
    latitude: -22.9,
    longitude: -43.2,
    timezone: "America/Sao_Paulo",
};

/** A map whose own weather is a clear sky: the server would pour no rain on it. */
const wam: WAMFileFormat = {
    version: "2.1.0",
    mapUrl: "map.tmj",
    areas: [],
    entityCollections: [],
    entities: {},
    settings: {
        weather: WeatherType.Clear,
        water: {
            runoff: 10,
            evaporation: 0,
            speed: 1,
            absorption: 0,
            current: 1,
            maxSurface: 18,
            indoorDrain: 0,
            impactReach: 1,
        },
    },
    terrain: hollow,
};

const slotAt = (temperature: number, rainRate: number): RealWeatherSlot => ({
    at: NOW - 60_000,
    weather: WeatherType.Rain,
    temperature,
    humidity: 90,
    rainRate,
});

/** Runs a local ground for `steps` steps; returns the last state of its water it told. */
function lastWater(
    slots: RealWeatherSlot[],
    steps: number,
    water?: { depths: Uint8Array; bounds: { x: number; y: number; width: number; height: number } },
): TerrainWaterMessage | undefined {
    const told: LocalTerrainTold[] = [];
    const simulation = new LocalTerrainSimulation(
        { wam, mapCells: MAP_CELLS, place: RIO, slots, ...(water ? { water } : {}) },
        (message) => told.push(message),
        () => NOW,
        () => 1,
    );
    simulation.setWam(wam);
    for (let step = 0; step < steps; step++) simulation.step();
    const last = told.filter((message) => message.kind === "water").at(-1);
    return last?.kind === "water" ? last.message : undefined;
}

/** The depths (px) of a whole state of the water, cell by cell. */
const depthsOf = (depths: Uint8Array): number[] =>
    Array.from({ length: depths.length / 2 }, (_, cell) => (depths[cell * 2] | (depths[cell * 2 + 1] << 8)) / 8);

describe("LocalTerrainSimulation", () => {
    it("rains the rain of the chosen place, on a map whose own sky is clear", () => {
        const water = lastWater([slotAt(25, 50)], 30);

        expect(water?.stats?.rainRate).toBe(50);
        expect(water?.stats?.rain).toBeGreaterThan(0);
    });

    it("brings no rain to the water where the cold of the chosen place turns it into snow", () => {
        const water = lastWater([slotAt(-10, 50)], 30);

        expect(water?.stats?.rainRate ?? 0).toBe(0);
    });

    it("starts from the water of the server, then lives on its own", () => {
        const bounds = { x: 0, y: 0, width: 4, height: 4 };
        const full = new Uint8Array(bounds.width * bounds.height * 2);
        // 8 px of water in each cell of the hollow, none around it.
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) full[(y * bounds.width + x) * 2] = 64;

        const water = lastWater([slotAt(25, 0)], 10, { depths: full, bounds });

        // No rain: the water there can only be the server's it started from.
        expect(water?.full).toBe(true);
        expect(depthsOf(water?.depths ?? new Uint8Array(0)).reduce((sum, depth) => sum + depth, 0)).toBeGreaterThan(0);
        expect(lastWater([slotAt(25, 0)], 10)).toBeUndefined();
    });
});

describe("LocalTerrainSimulation, the catastrophes of the room", () => {
    const bounds = { x: 0, y: 0, width: 4, height: 4 };
    /** 8 px of water in each cell of the hollow, none around it: the water of the server the ground starts from. */
    const lake = (): Uint8Array => {
        const full = new Uint8Array(bounds.width * bounds.height * 2);
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) full[(y * bounds.width + x) * 2] = 64;
        return full;
    };
    /** The water a dry sky leaves after `steps` steps, in px over all the cells; `happen` acts on the ground first. */
    function waterAfter(
        steps: number,
        happen: (simulation: LocalTerrainSimulation) => void,
        water?: { depths: Uint8Array; bounds: typeof bounds },
    ): number {
        const told: LocalTerrainTold[] = [];
        const simulation = new LocalTerrainSimulation(
            { wam, mapCells: MAP_CELLS, place: RIO, slots: [slotAt(25, 0)], ...(water ? { water } : {}) },
            (message) => told.push(message),
            () => NOW,
            () => 1,
        );
        simulation.setWam(wam);
        happen(simulation);
        for (let step = 0; step < steps; step++) simulation.step();
        const last = told.filter((message) => message.kind === "water").at(-1);
        if (last?.kind !== "water") return 0;
        // The last state told is a difference with the one before: the stock says the water there is.
        return last.message.stats?.stock ?? 0;
    }

    it("has none by itself: a dry sky leaves a dry ground", () => {
        expect(waterAfter(30, () => undefined)).toBe(0);
    });

    it("lets a downpour of the room rain on its water while it falls", () => {
        const fallen = waterAfter(30, (simulation) =>
            simulation.setCatastrophes({
                downpours: [{ id: 1, x: 24, y: 24, radiusTiles: 1, wholeMap: true }],
                drains: [],
                balls: [],
            }),
        );
        expect(fallen).toBeGreaterThan(0);
    });

    it("lets a drain of the room take its water", () => {
        const start = { depths: lake(), bounds };
        const kept = waterAfter(30, () => undefined, start);
        const drained = waterAfter(
            30,
            (simulation) =>
                simulation.setCatastrophes({
                    downpours: [],
                    drains: [{ id: 1, x: 24, y: 24, radiusTiles: 2 }],
                    balls: [],
                }),
            start,
        );
        expect(kept).toBeGreaterThan(0);
        expect(drained).toBeLessThan(kept);
    });

    it("lets a fireball of the room boil the water of its crater away", () => {
        const start = { depths: lake(), bounds };
        const kept = waterAfter(10, () => undefined, start);
        const boiled = waterAfter(10, (simulation) => simulation.burn(24, 24, 2, 1), start);
        expect(boiled).toBeLessThan(kept);
    });

    it("takes a comet, a broken ice, a soaked ground and a fire set without failing", () => {
        const start = { depths: lake(), bounds };
        expect(() =>
            waterAfter(
                10,
                (simulation) => {
                    simulation.strike(24, 24, 1);
                    simulation.shatter(24, 24, 1);
                    simulation.soak({ x: 24, y: 24, radiusTiles: 1, wholeMap: false });
                    simulation.ignite(24, 24, 1);
                    simulation.setCatastrophes({
                        downpours: [],
                        drains: [],
                        balls: [{ id: 1, x: 24, y: 24, radiusPx: 16 }],
                    });
                },
                start,
            ),
        ).not.toThrow();
    });
});

describe("localWaterSettings", () => {
    const water = wam.settings?.water;
    if (!water) throw new Error("the test map has water settings");

    it("lets what comes in and goes out go sixty times faster than real time, never past the bound", () => {
        expect(localWaterSettings({ ...water, speed: 1 }).speed).toBe(60);
        expect(localWaterSettings({ ...water, speed: 300 }).speed).toBe(300);
        expect(localWaterSettings({ ...water, speed: 1000 }).speed).toBe(1000);
    });

    it("tells the water once a second, at most as fine as 2, whatever the map asks of the server", () => {
        const local = localWaterSettings({ ...water, updates: 5, precision: 8 });

        expect(local.updates).toBe(1);
        expect(local.precision).toBe(2);
        expect(localWaterSettings({ ...water, precision: undefined }).precision).toBe(2);
    });
});
