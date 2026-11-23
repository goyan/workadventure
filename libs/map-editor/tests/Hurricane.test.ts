import { describe, expect, it } from "vitest";
import {
    bandShare,
    blendedWind,
    HURRICANE_INFLOW_DEGREES,
    HURRICANE_RMAX_M,
    HURRICANE_RMAX_PX,
    HURRICANE_TEN_MINUTES_OF_ONE,
    hollandShare,
    hurricaneAt,
    hurricaneConditions,
    hurricaneCrossing,
    hurricaneHere,
    hurricaneMaxWind,
    hurricaneMeanRain,
    hurricaneSpedUp,
    hurricaneTimesOf,
    hurricaneTrack,
    saffirSimpsonRange,
    skyRainUnder,
} from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import { Season } from "../src/types";
import { DEFAULT_FIRE_THRESHOLDS, fireDanger } from "../src/Weather/FireConditions";

const START = 1_800_000_000_000;
/** The map of Antoine: 240 x 160 tiles of 32 px. */
const MAP = { width: 7680, height: 5120 };

/** A hurricane going north over the middle of the map, in five minutes. */
function hurricane(overrides: Partial<Hurricane> = {}): Hurricane {
    const heading = overrides.heading ?? 0;
    return {
        id: 1,
        startedAt: START,
        category: 4,
        durationMs: 5 * 60_000,
        heading,
        southern: false,
        ...hurricaneCrossing(MAP.width, MAP.height, MAP.width / 2, MAP.height / 2, heading),
        ...overrides,
    };
}

/** The instant the eye is `px` before (negative) or after the middle of the map, going north. */
function atPx(storm: Hurricane, px: number): number {
    const length = Math.hypot(storm.toX - storm.fromX, storm.toY - storm.fromY);
    return storm.startedAt + (0.5 + px / length) * storm.durationMs;
}

function angleBetween(a: number, b: number): number {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return d > 180 ? 360 - d : d;
}

describe("hurricaneMaxWind", () => {
    it("is a wind of each Saffir-Simpson category, over 1 minute, brought to 10 minutes", () => {
        for (let category = 1; category <= 5; category++) {
            const [low, high] = saffirSimpsonRange(category);
            const oneMinute = hurricaneMaxWind(category) / HURRICANE_TEN_MINUTES_OF_ONE;
            expect(oneMinute).toBeGreaterThanOrEqual(low);
            expect(oneMinute).toBeLessThanOrEqual(high);
        }
        expect(hurricaneMaxWind(5)).toBeLessThanOrEqual(250);
    });
});

describe("hollandShare", () => {
    it("is the strongest wind at the radius of the strongest winds, and nothing in the centre", () => {
        expect(hollandShare(HURRICANE_RMAX_M)).toBeCloseTo(1, 10);
        expect(hollandShare(0.9 * HURRICANE_RMAX_M)).toBeLessThan(1);
        expect(hollandShare(1.1 * HURRICANE_RMAX_M)).toBeLessThan(1);
        expect(hollandShare(0)).toBe(0);
        expect(hollandShare(0.5)).toBeLessThan(0.01);
    });
});

describe("hurricaneCrossing", () => {
    it("brings the eye in at one edge of the map and out at the other, over the point asked", () => {
        expect(hurricaneCrossing(100, 50, 50, 25, 0)).toEqual({
            fromX: 50,
            fromY: 50,
            toX: 50,
            toY: 0,
            anchorX: 50,
            anchorY: 25,
        });
        const west = hurricaneCrossing(100, 50, 20, 10, 270);
        expect(west.fromX).toBeCloseTo(100, 9);
        expect(west.toX).toBeCloseTo(0, 9);
        expect(west.fromY).toBeCloseTo(10, 9);
        // A point outside the map: over its middle.
        expect(hurricaneCrossing(100, 50, -5, 900, 90)).toMatchObject({ anchorX: 50, anchorY: 25, fromX: 0, toX: 100 });
    });
});

describe("the storm, reduced to the map", () => {
    it("is wider than the map: its eye a few tens of metres, crossing in the time asked", () => {
        expect(HURRICANE_RMAX_M).toBeGreaterThanOrEqual(25);
        expect(HURRICANE_RMAX_M).toBeLessThanOrEqual(40);
        const storm = hurricane();
        expect(hurricaneAt(storm, START - 1)).toBeUndefined();
        expect(hurricaneAt(storm, START + storm.durationMs)).toBeUndefined();
        const first = hurricaneAt(storm, START);
        expect(first?.eyeX).toBeCloseTo(MAP.width / 2, 6);
        expect(first?.eyeY).toBeCloseTo(MAP.height, 6);
        // 175 m in 5 min.
        expect(first?.speedKmh).toBeCloseTo(((MAP.height / HURRICANE_RMAX_PX) * HURRICANE_RMAX_M * 3.6) / 300, 6);
    });

    it("blows round the eye anticlockwise in the north, turned in towards it by the inflow angle", () => {
        const storm = hurricane({ category: 5 });
        const at = atPx(storm, 0);
        // A point north of the eye, at the radius of the strongest winds.
        const north = hurricaneHere(storm, at, MAP.width / 2, MAP.height / 2 - HURRICANE_RMAX_PX);
        expect(north?.distanceM).toBeCloseTo(HURRICANE_RMAX_M, 6);
        // North of a centre, an anticlockwise wind goes west; turned in, west-south-west: from 67.6°.
        expect(angleBetween(north?.windFrom ?? NaN, 90 - HURRICANE_INFLOW_DEGREES)).toBeLessThan(3);
        expect(north?.windSpeed).toBeGreaterThan(hurricaneMaxWind(5) - 3);
        // The other way round in the south.
        const south = hurricaneHere(
            { ...storm, southern: true },
            at,
            MAP.width / 2,
            MAP.height / 2 - HURRICANE_RMAX_PX,
        );
        expect(angleBetween(south?.windFrom ?? NaN, 270 + HURRICANE_INFLOW_DEGREES)).toBeLessThan(3);
    });

    it("is not the same wind all over the map: calm in the eye, the strongest at the wall, less far out", () => {
        const storm = hurricane();
        const at = atPx(storm, 0);
        const x = MAP.width / 2;
        const eye = hurricaneHere(storm, at, x, MAP.height / 2);
        const wall = hurricaneHere(storm, at, x + HURRICANE_RMAX_PX, MAP.height / 2);
        const far = hurricaneHere(storm, at, x + 5 * HURRICANE_RMAX_PX, MAP.height / 2);
        expect(eye?.phase).toBe("eye");
        expect(eye?.rainRate).toBe(0);
        expect(eye?.cloudCover).toBeLessThan(0.2);
        expect(eye?.windSpeed).toBeLessThan(5);
        expect(wall?.phase).toBe("wall");
        expect(wall?.cloudCover).toBe(1);
        expect(wall?.windSpeed).toBeGreaterThan(hurricaneMaxWind(4) - 3);
        expect(far?.phase).toBe("bands");
        expect(far?.windSpeed).toBeLessThan((wall?.windSpeed ?? 0) * 0.6);
        expect(far?.windSpeed).toBeGreaterThan(40);
    });

    it("turns the wind round at a point the eye passes over, with the calm of the eye between", () => {
        const storm = hurricane({ category: 5 });
        const x = MAP.width / 2;
        const y = MAP.height / 2;
        const before = hurricaneHere(storm, atPx(storm, -HURRICANE_RMAX_PX), x, y);
        const after = hurricaneHere(storm, atPx(storm, HURRICANE_RMAX_PX), x, y);
        expect(angleBetween(before?.windFrom ?? NaN, after?.windFrom ?? NaN)).toBeGreaterThan(170);
        expect(before?.after).toBe(false);
        expect(after?.after).toBe(true);
    });

    it("begins and ends faded in from the weather of the map", () => {
        const storm = hurricane();
        const base = { temperature: 26, humidity: 70, windSpeed: 10, windFrom: 315 };
        expect(hurricaneConditions(base, storm, START)).toEqual(base);
        const middle = hurricaneConditions(base, storm, atPx(storm, -HURRICANE_RMAX_PX));
        expect(middle.windSpeed).toBeGreaterThan(150);
        expect(middle.humidity).toBe(95);
        expect(middle.temperature).toBe(26);
        expect(hurricaneConditions(base, storm, START + storm.durationMs)).toEqual(base);
        expect(hurricaneConditions(base, undefined, START)).toEqual(base);
    });
});

describe("the rain of a hurricane", () => {
    it("is the mean of its category at the radius of the strongest winds (Lonfat et al. 2004), none in the eye", () => {
        expect(hurricaneMeanRain(1, HURRICANE_RMAX_M)).toBeCloseTo(7, 10);
        expect(hurricaneMeanRain(4, HURRICANE_RMAX_M)).toBeCloseTo(12, 10);
        expect(hurricaneMeanRain(4, 0.5 * HURRICANE_RMAX_M)).toBe(0);
        expect(hurricaneMeanRain(4, 10 * HURRICANE_RMAX_M)).toBeLessThan(2);
    });

    it("falls in spiral bands that keep its mean round a circle", () => {
        for (const radii of [2, 5, 10]) {
            let sum = 0;
            for (let i = 0; i < 360; i++) sum += bandShare(radii * HURRICANE_RMAX_M, (i * Math.PI) / 180, false);
            expect(sum / 360).toBeCloseTo(1, 6);
        }
    });

    it("rains at real rates, the same total whatever the speed of the water, and not in the eye", () => {
        const storm = hurricane();
        const total = (groundSpeed: number): number => {
            let mm = 0;
            for (let t = START; t < START + storm.durationMs; t += 1000) {
                mm += (skyRainUnder(0, storm, t, groundSpeed) * groundSpeed * 1000) / 3_600_000;
            }
            return mm;
        };
        // Five minutes of rain of a few to a dozen mm/h at the middle of the map: about half a millimetre.
        expect(total(6)).toBeCloseTo(total(1), 9);
        expect(total(1)).toBeGreaterThan(0.1);
        expect(total(1)).toBeLessThan(1);
        expect(skyRainUnder(2, storm, atPx(storm, 0))).toBe(0);
        expect(skyRainUnder(2, storm, START)).toBe(2);
    });
});

describe("blendedWind", () => {
    it("mixes two winds as vectors", () => {
        expect(
            blendedWind({ windSpeed: 10, windFrom: 90 }, { windSpeed: 10, windFrom: 270 }, 0.5).windSpeed,
        ).toBeCloseTo(0, 10);
        expect(blendedWind({ windSpeed: 10, windFrom: 0 }, { windSpeed: 10, windFrom: 90 }, 0.5).windFrom).toBeCloseTo(
            45,
            6,
        );
    });
});

describe("hurricaneTrack", () => {
    it("keeps what a player asks for within bounds", () => {
        expect(hurricaneTrack({ category: 9, minutes: 100, heading: -10 }, true)).toEqual({
            category: 5,
            durationMs: 30 * 60_000,
            heading: 350,
            southern: true,
            waterEffect: 1,
        });
        expect(hurricaneTrack({}, false)).toEqual({
            category: 4,
            durationMs: 5 * 60_000,
            heading: 290,
            southern: false,
            waterEffect: 1,
        });
        // The effect on the water: one of those offered.
        expect(hurricaneTrack({ waterEffect: 5 }, false).waterEffect).toBe(4);
    });
});

describe("a fire under a hurricane", () => {
    it("is slowed by the rain of the wall, and lit by nothing new in its humid air", () => {
        const storm = hurricane();
        const x = MAP.width / 2;
        const y = MAP.height / 2;
        const base = { temperature: 36, humidity: 12, windSpeed: 45, windFrom: 270 };
        /** The most tiles burning at once in a dry meadow set on fire, 20 s in the wall, with its rain or not. */
        const mostBurning = (rains: boolean): number => {
            const meadow = new Meadow({ width: 41, height: 41 }, undefined, undefined);
            for (let row = 0; row < 41; row++) for (let col = 0; col < 41; col++) meadow.set(col, row, 0.1, 1, 1);
            meadow.ignite(20, 20, 3);
            let most = 0;
            for (let step = 0; step < 10; step++) {
                const epoch = atPx(storm, -1.5 * HURRICANE_RMAX_PX) + step * MEADOW_STEP_SECONDS * 1000;
                const conditions = hurricaneConditions(base, storm, epoch, x, y);
                meadow.step({
                    seconds: MEADOW_STEP_SECONDS,
                    rainMmPerHour: rains ? skyRainUnder(0, storm, epoch, 1, x, y) : 0,
                    daylight: true,
                    season: Season.Summer,
                    waterAt: () => 0,
                    random: () => 0.5,
                    fireDanger: fireDanger(conditions, DEFAULT_FIRE_THRESHOLDS),
                    windSpeed: conditions.windSpeed,
                    windFrom: conditions.windFrom,
                });
                most = Math.max(most, meadow.burning());
            }
            return most;
        };
        expect(
            fireDanger(
                hurricaneConditions(base, storm, atPx(storm, -1.5 * HURRICANE_RMAX_PX), x, y),
                DEFAULT_FIRE_THRESHOLDS,
            ),
        ).toBe(0);
        expect(mostBurning(true)).toBeLessThan(0.8 * mostBurning(false));
    });
});

describe("the speed of the map", () => {
    it("speeds the hurricane up by its own steps: ×1, ×5 at ×60, ×10 at ×600", () => {
        expect(hurricaneTimesOf(undefined)).toBe(1);
        expect(hurricaneTimesOf(1)).toBe(1);
        expect(hurricaneTimesOf(60)).toBeCloseTo(5, 9);
        expect(hurricaneTimesOf(600)).toBeCloseTo(10, 9);
        expect(hurricaneTimesOf(6000)).toBe(10);
    });

    it("shortens the crossing, never under 30 s, its eye where it was when the step changes", () => {
        const storm = hurricane();
        const now = START + 100_000;
        const faster = hurricaneSpedUp(storm, 5, now);
        expect(faster.durationMs).toBe(60_000);
        expect(faster.times).toBe(5);
        const before = hurricaneAt(storm, now);
        const after = hurricaneAt(faster, now);
        expect(after?.eyeX).toBeCloseTo(before?.eyeX ?? NaN, 6);
        expect(after?.eyeY).toBeCloseTo(before?.eyeY ?? NaN, 6);
        // Five times faster from there.
        expect(hurricaneAt(faster, now + 1000)!.eyeY - after!.eyeY).toBeCloseTo(
            5 * (hurricaneAt(storm, now + 1000)!.eyeY - before!.eyeY),
            6,
        );
        expect(hurricaneSpedUp(storm, 10, now).durationMs).toBe(30_000);
        expect(hurricaneSpedUp(storm, 600, now).durationMs).toBe(30_000);
        // Back to the speed asked, and the same hurricane when nothing changes.
        expect(hurricaneSpedUp(faster, 1, now + 1000).durationMs).toBe(300_000);
        expect(hurricaneSpedUp(storm, 1, now)).toBe(storm);
        // A crossing asked shorter than 30 s is not lengthened.
        const short = hurricane({ durationMs: 20_000 });
        expect(hurricaneSpedUp(short, 10, START).durationMs).toBe(20_000);
    });

    it("rains as much over a passage sped up: harder for a shorter time", () => {
        const total = (storm: Hurricane): number => {
            let mm = 0;
            for (let t = storm.startedAt; t < storm.startedAt + storm.durationMs; t += 100) {
                mm += (skyRainUnder(0, storm, t) * 100) / 3_600_000;
            }
            return mm;
        };
        const storm = hurricane();
        expect(total(hurricaneSpedUp(storm, 5, START))).toBeCloseTo(total(storm), 3);
    });
});
