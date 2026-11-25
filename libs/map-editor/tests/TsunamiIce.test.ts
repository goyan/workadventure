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
 * A strip of coast 160 cells long and 7 wide, banked all round but at its east end (the coast): a plain at the
 * altitude 0, with a lake full to its rim (2.2 m) 40 to 70 cells from its west end. A frost of -10 °C, its ice going
 * as fast as a map lets it (×600): the lake freezes over in minutes, then a tsunami of 3 m comes in by the coast.
 */
const WIDTH = 160;
const HEIGHT = 9;
const LAKE = { from: 40, to: 70 };
/** The tiles of the lake (two cells a tile), the rows of the strip within its banks. */
const LAKE_TILES = { from: 21, to: 34, rows: [1, 2, 3] };
const FROST = { temperature: -10, humidity: 90, windSpeed: 0 };

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
        live,
        iceAt,
        lakeIce,
        now: () => now,
        send: (sent: Tsunami | undefined) => {
            tsunami = sent;
        },
    };
}

describe("a tsunami over a frozen lake", () => {
    it("breaks the ice it lifts: the lake is open water while the flood stands over it", () => {
        const { live, iceAt, lakeIce, now, send } = frozenCoast();
        live(120);
        // Frozen over, thick enough to walk on.
        expect(Math.min(...lakeIce())).toBeGreaterThan(ICE_BEARS_MM);
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 60_000 });
        live(40);
        // The bore crossed the lake: metres of water over its ice (Mu River, Hokkaido, 2011: the ice cover broken
        // and carried upstream by the tsunami).
        expect(Math.max(...lakeIce())).toBe(0);
        // Nor does any ice take on the flood of the plain while it stands, even at -10 °C and ×600.
        const plain = Array.from({ length: 30 }, (_, at) => iceAt(40 + at, 2));
        expect(Math.max(...plain)).toBe(0);
    });

    it("does not give the lake its old ice back once the water the tsunami left is taken away", () => {
        const { live, lakeIce, now, send } = frozenCoast();
        live(120);
        const before = Math.min(...lakeIce());
        send({ id: 1, startedAt: now(), metres: 3, durationMs: 30_000 });
        live(30 + TSUNAMI_BACKWASH_MS / 1000);
        send(undefined);
        live(2);
        // What froze again since the ebb is the first ice of a new cover, by its law: not the cover that was broken.
        expect(Math.max(...lakeIce())).toBeLessThan(before / 2);
    });
});
