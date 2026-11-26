import { describe, expect, it } from "vitest";
import { TSUNAMI_BACKWASH_MS } from "../src/Catastrophe/Tsunami";
import type { Tsunami } from "../src/Catastrophe/Tsunami";
import { ICE_BEARS_MM } from "../src/Terrain/Ice";
import { GroundSimulation } from "../src/Terrain/GroundSimulation";
import type { Meadow } from "../src/Terrain/Meadow";
import { MeadowSimulation } from "../src/Terrain/MeadowSimulation";
import { cellKey, withHeights } from "../src/Terrain/TerrainGrid";
import { threadWaterLoads } from "../src/Terrain/WaterLoad";
import { WATER_STEP_MS } from "../src/Terrain/WaterInputs";
import { WaterSimulation } from "../src/Terrain/WaterSimulation";
import { DEFAULT_WATER_SETTINGS } from "../src/types";
import type { WAMFileFormat } from "../src/types";

/**
 * (Copied from TsunamiIce.test.ts, the lake made wider.) A strip of coast 160 cells long and 7 wide, banked all round but at its east end (the coast): a plain at the
 * altitude 0, with a lake full to its rim (2.2 m) 40 to 70 cells from its west end. A frost of -10 °C, its ice going
 * as fast as a map lets it (×600): the lake freezes over in minutes, then a tsunami of 3 m comes in by the coast.
 */
const WIDTH = 160;
const HEIGHT = 9;
const LAKE = { from: 10, to: 150 };
/** The tiles of the lake (two cells a tile), the rows of the strip within its banks. */
const LAKE_TILES = { from: 21, to: 34, rows: [1, 2, 3] };
const FROST = { temperature: -10, humidity: 90, windSpeed: 0 };

const wamOf: { current?: WAMFileFormat } = {};

function frozenCoast() {
    const heights = new Map<string, number>();
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (y === 0 || y === HEIGHT - 1 || x === 0) heights.set(cellKey(x, y), 256);
            else if (x >= LAKE.from && x < LAKE.to) heights.set(cellKey(x, y), -64);
        }
    }
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
                evaporation: 0,
                absorption: 0,
                indoorDrain: 0,
                freezeThawSpeed: 600,
            },
        },
        terrain: withHeights(undefined, heights),
    };
    threadWaterLoads.clear();
    let now = 1_000_000;
    let tsunami: Tsunami | undefined;
    wamOf.current = wam;
    const room = { getWam: () => wam, sendSubMessageToRoom: () => undefined };
    const rain = { slotsFor: () => undefined };
    const mapSize = () => ({ width: WIDTH, height: HEIGHT });
    const ground = new GroundSimulation({
        makeWater: () =>
            new WaterSimulation(
                room,
                rain,
                (bytes) => bytes,
                () => now,
                mapSize,
                () => 0,
                WATER_STEP_MS,
            ),
        makeMeadow: (water) =>
            new MeadowSimulation(
                room,
                rain,
                water,
                (bytes) => bytes,
                () => now,
                mapSize,
                () => [],
                undefined,
                () => 1,
            ),
        air: () => FROST,
        snow: () => FROST,
        walkers: () => [],
        catastrophes: { downpours: () => [], drains: () => [], balls: () => [], tsunami: () => tsunami },
    });
    ground.start();
    ground.stop();
    const grid = ground.water.getGrid();
    if (!grid) throw new Error("no grid");
    const bytes = new Uint8Array(grid.writeDepths().length);
    for (let y = 1; y < HEIGHT - 1; y++) {
        for (let x = LAKE.from; x < LAKE.to; x++) {
            const index = y * WIDTH + x;
            bytes[index * 2] = (64 * 8) & 255;
            bytes[index * 2 + 1] = (64 * 8) >> 8;
        }
    }
    grid.readDepths(bytes);
    /** Lives `seconds`: ten steps of the water a second, a step of the meadow every two seconds. */
    const live = (seconds: number): void => {
        for (let step = 0; step < (seconds * 1000) / WATER_STEP_MS; step++) {
            ground.water.step();
            if (step % 20 === 19) ground.meadow.step();
            now += WATER_STEP_MS;
        }
    };
    /** The ice the meadow of the room keeps, tile by tile (mm). */
    const iceAt = (tileX: number, tileY: number): number =>
        (Reflect.get(ground.meadow, "meadow") as Meadow | undefined)?.iceAt(tileX, tileY) ?? 0;
    const lakeIce = (): number[] =>
        LAKE_TILES.rows.flatMap((tileY) =>
            Array.from({ length: LAKE_TILES.to - LAKE_TILES.from }, (_, at) => iceAt(LAKE_TILES.from + at, tileY)),
        );
    return {
        ground,
        live,
        iceAt,
        lakeIce,
        now: () => now,
        send: (sent: Tsunami | undefined) => {
            tsunami = sent;
        },
    };
}

describe("a fireball on a frozen lake", () => {
    it("keeps its crater open water for a while, even in a hard frost on a map whose ice goes fast", () => {
        FROST.temperature = -10;
        const { ground, live, iceAt } = frozenCoast();
        live(60);
        // A cold snap of -80 °C, and ice that takes sixty times faster than the water goes: a minute freezes an hour.
        FROST.temperature = -80;
        const water = wamOf.current?.settings?.water;
        if (!water) throw new Error("no water settings");
        water.freezeThawSpeed = 60;
        const middle = 40;
        const crater = (): number[] => [-3, -2, -1, 0, 1, 2, 3].map((tile) => iceAt(middle + tile, 2));
        expect(Math.min(...crater())).toBeGreaterThan(0);
        ground.burn(middle * 32 + 16, 2 * 32 + 16, 3, 7);
        live(1);
        expect(crater()).toEqual([0, 0, 0, 0, 0, 0, 0]);
        // At -80 °C and sixty times the clock a bare crater would have a bearing ice in under a minute.
        live(60);
        expect(crater()).toEqual([0, 0, 0, 0, 0, 0, 0]);
        // Beyond the crater the sheet is whole.
        expect(iceAt(middle + 6, 2)).toBeGreaterThan(0);
        // Its time up, the frost closes it again.
        live(60);
        expect(Math.min(...crater())).toBeGreaterThan(0);
        FROST.temperature = -10;
    });
});
