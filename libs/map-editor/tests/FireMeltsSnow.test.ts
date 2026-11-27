import { describe, expect, it } from "vitest";
import { FIRE_PATCHES_PER_SECOND } from "../src/Catastrophe/FirePatch";
import { GroundSimulation } from "../src/Terrain/GroundSimulation";
import type { Meadow } from "../src/Terrain/Meadow";
import { MeadowSimulation } from "../src/Terrain/MeadowSimulation";
import { SNOW_FULL_MM, snowCoverOf, snowMmOfByte } from "../src/Terrain/Snow";
import { withHeights } from "../src/Terrain/TerrainGrid";
import { threadWaterLoads } from "../src/Terrain/WaterLoad";
import { WATER_STEP_MS } from "../src/Terrain/WaterInputs";
import { WaterSimulation } from "../src/Terrain/WaterSimulation";
import { DEFAULT_WATER_SETTINGS, TILE_PX, WeatherType } from "../src/types";
import type { WAMFileFormat } from "../src/types";
import type { RealWeatherSlot } from "../src/Weather/RealWeather";

/**
 * A flat map of 32 × 32 tiles under the snow of Montréal on 2026-11-27 (0.7 °C, 96 %, wind of 18 km/h, 8 mm/h of
 * water), the case of the snow that holds on the ground: a player holds a patch of fire two tiles wide in its middle.
 * What is read is what the room is told, as a browser draws it.
 */
const TILES = 32;
const AIR = { temperature: 0.7, humidity: 96, windSpeed: 18 };
const MIDDLE = 16;

function snowyMap(freezeThawSpeed: number) {
    const wam: WAMFileFormat = {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {},
        settings: { weather: WeatherType.Real, water: { ...DEFAULT_WATER_SETTINGS, freezeThawSpeed } },
        terrain: withHeights(undefined, new Map([["0,0", 1]])),
    };
    threadWaterLoads.clear();
    const start = Date.UTC(2026, 10, 27, 9, 30);
    let now = start;
    const slots: RealWeatherSlot[] = Array.from({ length: 16 }, (_, index) => ({
        at: start - 3_600_000 + index * 15 * 60_000,
        weather: WeatherType.Rain,
        temperature: AIR.temperature,
        humidity: AIR.humidity,
        windSpeed: AIR.windSpeed,
        windFrom: 45,
        rainRate: 8,
    }));
    let told: Uint8Array = new Uint8Array(0);
    const room = {
        getWam: () => wam,
        sendSubMessageToRoom: (sent: { message?: { $case: string; meadowMessage?: { snow: Uint8Array } } }) => {
            if (sent.message?.$case === "meadowMessage" && sent.message.meadowMessage) {
                told = sent.message.meadowMessage.snow;
            }
        },
    };
    const rain = { slotsFor: () => slots };
    const mapSize = () => ({ width: TILES * 2, height: TILES * 2 });
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
        air: () => AIR,
        snow: () => AIR,
        walkers: () => [],
    });
    ground.start();
    ground.stop();
    /** Lives `seconds`: ten steps of the water a second, a step of the meadow every two seconds. */
    const live = (seconds: number): void => {
        for (let step = 0; step < Math.round((seconds * 1000) / WATER_STEP_MS); step++) {
            ground.water.step();
            if (step % 20 === 19) ground.meadow.step();
            now += WATER_STEP_MS;
        }
    };
    /** How white a tile is drawn, from what the room was last told. */
    const seen = (tileX: number, tileY: number): number =>
        told.length > 0 ? snowCoverOf(snowMmOfByte(told[tileY * TILES + tileX])) : 0;
    /** The fire held `seconds` in the middle of the map, a patch at each report of the pointer. */
    const holdFire = (seconds: number): void => {
        for (let patch = 0; patch < seconds * FIRE_PATCHES_PER_SECOND; patch++) {
            ground.meadow.ignite(MIDDLE * TILE_PX + TILE_PX / 2, MIDDLE * TILE_PX + TILE_PX / 2, 2);
            live(1 / FIRE_PATCHES_PER_SECOND);
        }
    };
    const meadow = () => Reflect.get(ground.meadow, "meadow") as Meadow;
    return { live, seen, holdFire, meadow };
}

describe("a fire held on a ground white with snow", () => {
    it("melts the snow around its flames at « >>> » (×600), where it stayed white", () => {
        const map = snowyMap(600);
        map.live(30);
        expect(map.seen(MIDDLE, MIDDLE)).toBeGreaterThan(0.9);
        map.holdFire(3);
        map.live(2);
        // Under the flames, bare; a tile beyond them, bare too; three tiles beyond, still white.
        expect(map.seen(MIDDLE, MIDDLE)).toBe(0);
        expect(map.seen(MIDDLE + 3, MIDDLE)).toBeLessThan(0.5);
        expect(map.seen(MIDDLE + 3, MIDDLE)).toBeLessThan(map.seen(MIDDLE + 4, MIDDLE));
        expect(map.seen(MIDDLE + 5, MIDDLE)).toBeGreaterThan(0.5);
        // Let go, the snow that falls as fast covers it again: what it melted was not kept warm.
        map.live(20);
        expect(map.seen(MIDDLE + 3, MIDDLE)).toBeGreaterThan(0.5);
    });

    it("melts no snow a metre from its flames in three seconds of reality", () => {
        const map = snowyMap(1);
        map.meadow().snowOn(0, 0, undefined, SNOW_FULL_MM);
        map.live(2);
        map.holdFire(3);
        map.live(2);
        expect(map.seen(MIDDLE, MIDDLE)).toBe(0);
        expect(map.seen(MIDDLE + 3, MIDDLE)).toBeGreaterThan(0.9);
    });
});
