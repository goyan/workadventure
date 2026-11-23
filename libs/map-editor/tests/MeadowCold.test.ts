import { describe, expect, it } from "vitest";
import {
    COLD_CORE_SHARE,
    COLD_DEFAULT_CELSIUS,
    COLD_DEFAULT_TILES,
    COLD_GONE_DEGREES,
    COLD_MAX_CELSIUS,
    COLD_MAX_TILES,
    COLD_MIN_CELSIUS,
    COLD_MIN_TILES,
    COLD_WARMS_MINUTES,
    coldGoneInMinutes,
    coldWarmsMinutes,
    airBroughtTo,
    coldAirAt,
    coldAirOver,
    coldCelsius,
    coldShare,
    coldTiles,
    warmedCold,
} from "../src/Catastrophe/Cold";
import type { ColdMass } from "../src/Catastrophe/Cold";
import { ICE_BEARS_MM, ICE_SLIPS_MM } from "../src/Terrain/Ice";
import { hoarFrost } from "../src/Weather/HoarFrost";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { Season, TILE_PX } from "../src/types";

const size = { width: 41, height: 21 };
const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
/** Two ponds 16 px deep: one on the tile (10, 10), one far to the east on (30, 10). Dry ground elsewhere. */
const ponds = (tileX: number, tileY: number): number => (tileY === 10 && (tileX === 10 || tileX === 30) ? 16 : 0);
/** A mass of air at -80 °C, 4 tiles wide, over the pond of the west. */
const mass: ColdMass = { id: 1, x: 10.5 * TILE_PX, y: 10.5 * TILE_PX, radiusTiles: 4, temperature: -80 };
/** A map whose water, snow and ice go sixty times faster than reality: a minute for an hour. */
const under = (more: Partial<MeadowStepInput> = {}): MeadowStepInput => ({
    seconds: MEADOW_STEP_SECONDS,
    snowTimes: 60,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: ponds,
    random: () => 1,
    weather: mild,
    ...more,
});
const run = (meadow: Meadow, steps: number, input: MeadowStepInput): void => {
    for (let step = 0; step < steps; step++) meadow.step(input);
};

describe("a mass of cold air", () => {
    it("is 1 to 16 tiles wide, 3 when it says none, and -5 to -120 °C, -80 when it says none", () => {
        expect([COLD_MIN_TILES, COLD_MAX_TILES, COLD_DEFAULT_TILES]).toEqual([1, 16, 3]);
        expect(coldTiles(0)).toBe(3);
        expect(coldTiles(Number.NaN)).toBe(3);
        expect(coldTiles(99)).toBe(16);
        expect(coldTiles(-2)).toBe(1);
        expect([COLD_MIN_CELSIUS, COLD_MAX_CELSIUS, COLD_DEFAULT_CELSIUS]).toEqual([-120, -5, -80]);
        expect(coldCelsius(undefined)).toBe(-80);
        expect(coldCelsius(Number.NaN)).toBe(-80);
        expect(coldCelsius(0)).toBe(-80);
        expect(coldCelsius(-300)).toBe(-120);
        expect(coldCelsius(20)).toBe(-5);
        expect(coldCelsius(-42.4)).toBe(-42);
    });

    it("is whole in its core and fades to nothing at its rim", () => {
        expect(COLD_CORE_SHARE).toBe(0.5);
        expect(coldShare(0)).toBe(1);
        expect(coldShare(0.5)).toBe(1);
        expect(coldShare(0.75)).toBeCloseTo(0.5, 6);
        expect(coldShare(1)).toBe(0);
        expect(coldShare(3)).toBe(0);
        expect(coldShare(0.6)).toBeGreaterThan(coldShare(0.9));
    });

    it("gives the air of a point: its own in its core, that of the map outside, the coldest where two meet", () => {
        expect(coldAirAt([mass], mass.x, mass.y, 10)).toBe(-80);
        expect(coldAirAt([mass], mass.x + 5 * TILE_PX, mass.y, 10)).toBe(10);
        expect(coldAirAt([mass], mass.x + 3 * TILE_PX, mass.y, 10)).toBeCloseTo(10 - 90 * coldShare(0.75), 6);
        expect(coldAirAt([], mass.x, mass.y, 10)).toBe(10);
        const other = { ...mass, id: 2, temperature: -20 };
        expect(coldAirAt([other, mass], mass.x, mass.y, 10)).toBe(-80);
        // A mass warmer than the air of the map cools nothing.
        expect(coldAirAt([mass], mass.x, mass.y, -100)).toBe(-100);
    });

    it("gives the whole air of a point: colder, and as damp as the same vapour makes it there, 100 % at most", () => {
        const air = { temperature: 10, humidity: 50, windSpeed: 12 };
        // Outside: the air of the map, the very same.
        expect(coldAirOver([mass], mass.x + 5 * TILE_PX, mass.y, air)).toBe(air);
        // In the core: -80 °C, saturated (the air of the map held far more vapour than an air that cold can), same wind.
        expect(coldAirOver([mass], mass.x, mass.y, air)).toEqual({ temperature: -80, humidity: 100, windSpeed: 12 });
        // Cooled a little: the same vapour is a higher relative humidity, not yet saturated.
        expect(airBroughtTo(air, 5).humidity).toBeGreaterThan(65);
        expect(airBroughtTo(air, 5).humidity).toBeLessThan(75);
        // The frost of the ground goes by that air: none in the mild air of the map, some under the mass.
        expect(hoarFrost({ ...air })).toBe(0);
        expect(hoarFrost(coldAirOver([mass], mass.x, mass.y, air))).toBeGreaterThan(0);
        expect(hoarFrost(coldAirOver([mass], mass.x + 3 * TILE_PX, mass.y, air))).toBeGreaterThan(0.9);
        // An air whose humidity is not known stays so.
        expect(coldAirOver([mass], mass.x, mass.y, { temperature: 10 })).toEqual({ temperature: -80 });
    });

    it("comes back to the air of the map little by little once it is let go", () => {
        // A pool of cold air with no source mixes away in minutes: what parts it from the air of the map is divided
        // by e every minute of the map in a calm, faster in the wind.
        expect(COLD_WARMS_MINUTES).toBe(1);
        expect(warmedCold(-80, 10, 0)).toBe(-80);
        expect(warmedCold(-80, 10, 1)).toBeCloseTo(10 - 90 / Math.E, 6);
        expect(coldWarmsMinutes(0)).toBe(1);
        expect(coldWarmsMinutes(10)).toBeCloseTo(0.5, 9);
        expect(coldWarmsMinutes(Number.NaN)).toBe(1);
        expect(warmedCold(-80, 10, 0.5, 10)).toBeCloseTo(10 - 90 / Math.E, 6);
        // How long it still has: from -80 °C under 24 °C, about five minutes and a half of the map in a calm.
        expect(coldGoneInMinutes(-80, 24)).toBeCloseTo(Math.log(104 / 0.5), 6);
        expect(coldGoneInMinutes(-80, 24)).toBeGreaterThan(5);
        expect(coldGoneInMinutes(-80, 24)).toBeLessThan(6);
        expect(coldGoneInMinutes(-80, 24, 10)).toBeCloseTo(Math.log(104 / 0.5) / 2, 6);
        expect(coldGoneInMinutes(24, 24)).toBe(0);
        expect(coldGoneInMinutes(-80, Number.NaN)).toBe(0);
        expect(warmedCold(-80, 24, coldGoneInMinutes(-80, 24) + 0.001)).toBe(24);
        expect(warmedCold(-80, 10, 0.2)).toBeLessThan(warmedCold(-80, 10, 0.4));
        // Close enough to the air of the map, it is that air.
        expect(COLD_GONE_DEGREES).toBe(0.5);
        expect(warmedCold(-80, 10, 600)).toBe(10);
        expect(warmedCold(9.7, 10, 0)).toBe(10);
        expect(warmedCold(-80, Number.NaN, 5)).toBeNaN();
    });
});

describe("the meadow under a mass of cold air", () => {
    it("freezes the pond under it in a mild air, and not the pond away from it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 1, under({ cold: [mass] }));
        // Two seconds at -80 °C, a minute for an hour: already an ice one slips on.
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(ICE_SLIPS_MM);
        expect(meadow.iceAt(30, 10)).toBe(0);
        expect(meadow.icy()).toBe(true);
    });

    it("bears a walker after about half an hour of the map at -80 °C: half a minute at a minute for an hour", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 12, under({ cold: [mass] }));
        expect(meadow.iceAt(10, 10)).toBeLessThan(ICE_BEARS_MM);
        run(meadow, 8, under({ cold: [mass] }));
        expect(meadow.iceAt(10, 10)).toBeGreaterThanOrEqual(ICE_BEARS_MM);
    });

    it("freezes less towards its rim, and nothing past it", () => {
        const row = (tileX: number, tileY: number): number => (tileY === 10 ? 16 : 0);
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under({ cold: [mass], waterAt: row }));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(meadow.iceAt(13, 10));
        expect(meadow.iceAt(13, 10)).toBeGreaterThan(0);
        expect(meadow.iceAt(12, 10)).toBe(meadow.iceAt(8, 10));
        expect(meadow.iceAt(15, 10)).toBe(0);
    });

    it("takes no ice on a water that runs too fast, as in any frost", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under({ cold: [mass], currentAt: () => 1.5 }));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("keeps the snow under it from melting, while the snow around melts", () => {
        const meadow = new Meadow(size, undefined, undefined);
        const dry = (): number => 0;
        run(meadow, 1, under({ waterAt: dry, weather: { ...mild, temperature: -5 }, snowfallMm: 20 }));
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20, 3);
        // Five hours of the map at 10 °C.
        run(meadow, 150, under({ waterAt: dry, cold: [mass] }));
        expect(meadow.snowAt(10, 10)).toBeGreaterThan(19);
        expect(meadow.snowAt(30, 10)).toBeLessThan(meadow.snowAt(10, 10) - 5);
    });

    it("freezes the soil under it: its moisture stays, while the soil around dries", () => {
        const meadow = new Meadow(size, undefined, undefined);
        const dry = (): number => 0;
        meadow.soak(10, 10, 0);
        meadow.soak(30, 10, 0);
        const before = meadow.moistureAt(10, 10);
        run(meadow, 200, under({ waterAt: dry, cold: [mass] }));
        expect(meadow.moistureAt(10, 10)).toBeCloseTo(before, 2);
        expect(meadow.moistureAt(30, 10)).toBeLessThan(before - 0.05);
    });

    it("lets the ice thaw at the pace of the air of the map once it is gone, not at once", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 20, under({ cold: [mass] }));
        const frozen = meadow.iceAt(10, 10);
        run(meadow, 1, under());
        expect(meadow.iceAt(10, 10)).toBeLessThan(frozen);
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(frozen * 0.8);
        // Twenty hours of the map later it is thinner, not gone; a few days later, gone.
        run(meadow, 600, under());
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBeLessThan(frozen / 2);
        run(meadow, 3000, under());
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("changes nothing where there is none: the same meadow with no mass, an empty list, or one far away", () => {
        const plain = new Meadow(size, undefined, undefined);
        const none = new Meadow(size, undefined, undefined);
        const far = new Meadow(size, undefined, undefined);
        const frost = { ...mild, temperature: -8 };
        for (let step = 0; step < 15; step++) {
            plain.step(under({ weather: frost, snowfallMm: 1 }));
            none.step(under({ weather: frost, snowfallMm: 1, cold: [] }));
            far.step(under({ weather: frost, snowfallMm: 1, cold: [{ ...mass, x: -4000, y: -4000 }] }));
        }
        for (const other of [none, far]) {
            expect(other.writeIce()).toEqual(plain.writeIce());
            expect(other.writeSnow()).toEqual(plain.writeSnow());
            expect(other.writeMoisture()).toEqual(plain.writeMoisture());
            expect(other.writeGrass()).toEqual(plain.writeGrass());
        }
    });

    it("freezes with the snow alone too, on a map that turned its meadow off", () => {
        const meadow = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 5; step++) meadow.stepSnowAlone(under({ cold: [mass] }));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(ICE_SLIPS_MM);
        expect(meadow.iceAt(30, 10)).toBe(0);
    });
});
