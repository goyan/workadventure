import { describe, expect, it } from "vitest";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { DEFAULT_POOL_STYLE, poolSoilCode } from "../src/Terrain/Pools";
import { cellKey, withSoils } from "../src/Terrain/TerrainGrid";
import { PX_PER_MM } from "../src/Terrain/WaterInputs";
import { ICE_BEARS_MM, ICE_SLIPS_MM } from "../src/Terrain/Ice";
import { Season } from "../src/types";

const size = { width: 21, height: 21 };
const frost: SnowWeather = { temperature: -10, humidity: 100, windSpeed: 0 };
const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
/** A lake of 16 px of water on the tile (10, 10), a puddle of 1 px on (4, 4), dry ground elsewhere. */
const lake = (tileX: number, tileY: number): number =>
    tileX === 10 && tileY === 10 ? 16 : tileX === 4 && tileY === 4 ? 1 : 0;
/**
 * The clock of these tests: a map whose water, snow and ice go 600 times faster than reality (the clock of the snow
 * before the water of reality became the default), so that a step shows what takes hours in reality.
 */
const CLOCK = 600;
const under = (weather: SnowWeather | undefined, more: Partial<MeadowStepInput> = {}): MeadowStepInput => ({
    seconds: MEADOW_STEP_SECONDS,
    snowTimes: CLOCK,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: lake,
    random: () => 1,
    weather,
    ...more,
});
const run = (meadow: Meadow, steps: number, input: MeadowStepInput): void => {
    for (let step = 0; step < steps; step++) meadow.step(input);
};

describe("the water freezing", () => {
    it("takes in ice from its surface in the frost, thicker with time, and only where water lies", () => {
        const meadow = new Meadow(size, undefined, undefined);
        expect(meadow.icy()).toBe(false);
        run(meadow, 5, under(frost));
        // 10 s at -10 °C, the ice thickening 1200 times faster than the real clock (ICE_GROWTH_TIMES): about 3 cm.
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(20);
        expect(meadow.iceAt(10, 10)).toBeLessThan(40);
        run(meadow, 10, under(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(45);
        expect(meadow.iceAt(10, 10)).toBeLessThan(62);
        expect(meadow.iceAt(11, 10)).toBe(0);
        expect(meadow.icy()).toBe(true);
    });

    it("is never thicker than the water under it: a puddle freezes through", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 60, under(frost));
        expect(meadow.iceAt(4, 4)).toBeCloseTo(1 / PX_PER_MM, 1);
    });

    it("holds at 0 °C, and in an air that is not known", () => {
        for (const weather of [{ ...frost, temperature: 0 }, undefined]) {
            const meadow = new Meadow(size, undefined, undefined);
            run(meadow, 10, under(frost));
            const before = meadow.iceAt(10, 10);
            run(meadow, 10, under(weather));
            expect(meadow.iceAt(10, 10)).toBeCloseTo(before);
        }
    });

    it("thaws in a mild air, without giving water of its own: it is the water under it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const before = meadow.iceAt(10, 10);
        expect(meadow.step(under(mild))).toBeUndefined();
        expect(meadow.iceAt(10, 10)).toBeLessThan(before);
        run(meadow, 200, under(mild));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("goes with the water that leaves", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        meadow.step(under(frost, { waterAt: () => 0 }));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("tells whether it moved at the last step", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.step(under(frost));
        expect(meadow.iceMoved()).toBe(true);
        meadow.step(under({ ...frost, temperature: 0 }));
        expect(meadow.iceMoved()).toBe(false);
    });
});

describe("the ice, the snow and the fire", () => {
    it("holds the snow that falls on it, even in an air that thaws", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        meadow.snowOn(10, 10, 0, 20);
        const melted = meadow.step(under({ temperature: 1, humidity: 50, windSpeed: 0 }));
        // On open water the 20 mm would have melted at once.
        expect(meadow.snowAt(10, 10)).toBeGreaterThan(15);
        expect(melted?.meltedMm[10 * size.width + 10] ?? 0).toBeLessThan(5);
    });

    it("melts under the heat of a fire, after the snow lying on it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        meadow.snowOn(10, 10, 0, 10);
        meadow.warm(10, 10, 0, 20);
        meadow.step(under({ ...frost, temperature: 0 }));
        expect(meadow.snowAt(10, 10)).toBe(0);
        expect(meadow.iceAt(10, 10)).toBeCloseTo(ice - 10, 0);
    });

    it("is broken where asked, and melts with the snow where a fireball lands", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        expect(meadow.breakIce(10, 10, 1)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBe(0);
        expect(meadow.iceAt(4, 4)).toBeGreaterThan(0);
        meadow.melt(4, 4, 0);
        expect(meadow.iceAt(4, 4)).toBe(0);
    });

    it("breaks where a tsunami lifts it by more than its own thickness, and takes on no such flood", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 15, under(frost));
        const thick = meadow.iceAt(10, 10);
        expect(thick).toBeGreaterThan(ICE_BEARS_MM);
        // Lifted by less than its thickness: it floats up whole, and goes on thickening.
        meadow.step(under(frost, { liftAt: () => thick / 2 }));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(thick);
        // By more: broken, and the flood over it does not freeze again while it stands that high.
        meadow.step(under(frost, { liftAt: (tileX, tileY) => (tileX === 10 && tileY === 10 ? 2 * thick : 0) }));
        expect(meadow.iceAt(10, 10)).toBe(0);
        expect(meadow.iceAt(4, 4)).toBeGreaterThan(0);
        run(meadow, 5, under(frost, { liftAt: () => 1000 }));
        expect(meadow.iceAt(10, 10)).toBe(0);
        // The flood gone, the water freezes again by its law, from nothing.
        meadow.step(under(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBeLessThan(thick);
    });
});

describe("the ice kept", () => {
    it("does not take on water that runs fast: a pond and a river side by side at -10 °C", () => {
        // Three tiles of the same water, 16 px deep: still (a pond), between the two speeds, over the open one.
        const waterAt = (tileX: number, tileY: number): number => (tileY === 10 && tileX >= 9 && tileX <= 11 ? 16 : 0);
        const currentAt = (tileX: number): number => (tileX === 9 ? 0 : tileX === 10 ? 0.9 : 1.5);
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 15, under(frost, { waterAt, currentAt }));
        const pond = meadow.iceAt(9, 10);
        expect(pond).toBeGreaterThan(ICE_BEARS_MM);
        expect(meadow.iceAt(11, 10)).toBe(0);
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBeLessThan(pond);
    });

    it("takes as before, to the bit, on still water", () => {
        const before = new Meadow(size, undefined, undefined);
        const still = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 15; step++) {
            before.step(under(frost));
            still.step(under(frost, { currentAt: () => 0 }));
        }
        expect(Array.from(still.writeIce())).toEqual(Array.from(before.writeIce()));
        for (let tileX = 0; tileX < size.width; tileX++) {
            for (let tileY = 0; tileY < size.height; tileY++) {
                expect(still.iceAt(tileX, tileY)).toBe(before.iceAt(tileX, tileY));
            }
        }
    });

    it("keeps the ice that took on a water that then runs fast: a current does not melt it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 15, under(frost));
        const before = meadow.iceAt(10, 10);
        run(meadow, 15, under(frost, { currentAt: () => 2 }));
        expect(meadow.iceAt(10, 10)).toBe(before);
    });

    it("broken (a hole), freezes again by its law at the pace of the map: hours in real time, never in a thaw", () => {
        const real = (weather: SnowWeather): MeadowStepInput => under(weather, { snowTimes: 1 });
        const minutes = (count: number): number => (count * 60) / MEADOW_STEP_SECONDS;
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 30, under(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(ICE_BEARS_MM);
        meadow.breakIce(10, 10, 1);
        expect(meadow.iceAt(10, 10)).toBe(0);
        // Two minutes at -10 °C: a film, not yet the ice one slips on: the hole is open water.
        run(meadow, minutes(2), real(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBeLessThan(ICE_SLIPS_MM);
        // Some hours: an ice again, that bears a walker.
        run(meadow, minutes(6 * 60), real(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(ICE_BEARS_MM);
        // In a thaw the hole never closes.
        meadow.breakIce(10, 10, 1);
        run(meadow, minutes(6 * 60), real(mild));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("is written in a byte a tile and read back, none in a state saved before it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        const read = new Meadow(size, undefined, undefined);
        expect(
            read.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, undefined, meadow.writeIce()),
        ).toBe(true);
        expect(read.iceAt(10, 10)).toBeGreaterThan(ice * 0.85);
        expect(read.iceAt(10, 10)).toBeLessThan(ice * 1.15);
        expect(read.read(meadow.writeGrass(), meadow.writeMoisture())).toBe(true);
        expect(read.iceAt(10, 10)).toBe(0);
        expect(
            read.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, undefined, new Uint8Array(3)),
        ).toBe(false);
    });

    it("follows the meadow that replaces it, and stays when the grass is turned off", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        const next = new Meadow(size, undefined, undefined);
        next.takeFrom(meadow);
        expect(next.iceAt(10, 10)).toBeCloseTo(ice);
        meadow.clear();
        expect(meadow.iceAt(10, 10)).toBeCloseTo(ice);
    });
});

describe("the pools freezing", () => {
    /** The four cells of a tile painted as a pool of that style. */
    const poolAt = (tileX: number, tileY: number, style: number): [string, number][] =>
        [0, 1].flatMap((y) =>
            [0, 1].map((x): [string, number] => [cellKey(tileX * 2 + x, tileY * 2 + y), poolSoilCode(style)]),
        );
    const terrain = withSoils(undefined, new Map([...poolAt(6, 6, 0), ...poolAt(8, 6, 1)]));
    const styles = [DEFAULT_POOL_STYLE, { ...DEFAULT_POOL_STYLE, hot: true }];
    /** The water of the relief the pump of the server keeps in the two pools. */
    const filled = (weather: SnowWeather | undefined): MeadowStepInput =>
        under(weather, { waterAt: (x, y) => (y === 6 && (x === 6 || x === 8) ? 46 : 0) });

    it("takes the water of a pool in ice as the water of a lake, and thaws it", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, filled(frost));
        expect(meadow.iceAt(6, 6)).toBeGreaterThan(45);
        expect(meadow.iceAt(7, 6)).toBe(0);
        run(meadow, 300, filled(mild));
        expect(meadow.iceAt(6, 6)).toBe(0);
    });

    it("never freezes a pool whose water is heated, and melts the snow that falls in it", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, filled(frost));
        expect(meadow.iceAt(8, 6)).toBe(0);
        meadow.snowOn(8, 6, 0, 20);
        meadow.step(filled(frost));
        expect(meadow.snowAt(8, 6)).toBe(0);
    });

    it("has no ice in a pool that was emptied", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, under(frost, { waterAt: () => 0 }));
        expect(meadow.iceAt(6, 6)).toBe(0);
    });
});

describe("the water freezing at the extremes of the conditions", () => {
    it("freezes the lake through in a polar storm without going beyond its water, and thaws it in a hot storm within seconds", () => {
        const meadow = new Meadow(size, undefined, undefined);
        const polar: SnowWeather = { temperature: -80, humidity: 50, windSpeed: 250 };
        run(meadow, 1, under(polar));
        const frozen = meadow.iceAt(10, 10);
        expect(Number.isFinite(frozen)).toBe(true);
        expect(frozen).toBeGreaterThan(0);
        expect(frozen).toBeLessThanOrEqual(16 / PX_PER_MM);
        run(meadow, 30, under(polar));
        expect(meadow.iceAt(10, 10)).toBeCloseTo(16 / PX_PER_MM, 2);
        // A hot storm thaws some 108 mm a step of 2 s: half a metre of ice is gone in a dozen seconds.
        const hot: SnowWeather = { temperature: 80, humidity: 100, windSpeed: 250 };
        run(meadow, 1, under(hot));
        expect(meadow.iceAt(10, 10)).toBeCloseTo(16 / PX_PER_MM - 108, 2);
        run(meadow, 5, under(hot));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });
});
