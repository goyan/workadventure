import { describe, expect, it } from "vitest";
import {
    bandShare,
    blendedWind,
    HURRICANE_INFLOW_DEGREES,
    HURRICANE_MOTION_SHARE,
    HURRICANE_REAL_PASSAGE_MS,
    HURRICANE_RMAX_KM,
    HURRICANE_TEN_MINUTES_OF_ONE,
    HURRICANE_TRANSLATION_KMH,
    hollandShare,
    hurricaneAt,
    hurricaneCompression,
    hurricaneConditions,
    hurricaneMaxWind,
    hurricaneMeanRain,
    hurricaneTrack,
    saffirSimpsonRange,
    skyRainUnder,
} from "../src/Catastrophe/Hurricane";
import type { Hurricane } from "../src/Catastrophe/Hurricane";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import { Season } from "../src/types";

const START = 1_800_000_000_000;

function hurricane(overrides: Partial<Hurricane> = {}): Hurricane {
    return {
        id: 1,
        startedAt: START,
        category: 4,
        durationMs: 30 * 60_000,
        offsetKm: 0,
        heading: 0,
        southern: false,
        ...overrides,
    };
}

/** The instant at that share of the passage. */
function at(storm: Hurricane, progress: number): number {
    return storm.startedAt + progress * storm.durationMs;
}

/** The progress at which the centre is `km` before (negative) or after the nearest it comes. */
function progressAtKm(km: number): number {
    return 0.5 + (km / HURRICANE_TRANSLATION_KMH) * (3_600_000 / HURRICANE_REAL_PASSAGE_MS);
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
    });

    it("never goes beyond the strongest wind a room may have", () => {
        expect(hurricaneMaxWind(5)).toBeLessThanOrEqual(250);
    });
});

describe("hollandShare", () => {
    it("is the strongest wind at the radius of the strongest winds, and nothing in the centre", () => {
        expect(hollandShare(HURRICANE_RMAX_KM)).toBeCloseTo(1, 10);
        expect(hollandShare(0.9 * HURRICANE_RMAX_KM)).toBeLessThan(1);
        expect(hollandShare(1.1 * HURRICANE_RMAX_KM)).toBeLessThan(1);
        expect(hollandShare(0)).toBe(0);
        expect(hollandShare(0.1)).toBeLessThan(0.01);
    });
});

describe("hurricaneAt", () => {
    it("lasts a day and a half of real time, lived in the length asked for", () => {
        expect(HURRICANE_REAL_PASSAGE_MS).toBe(36 * 3_600_000);
        expect(hurricaneCompression(30 * 60_000)).toBe(72);
        const storm = hurricane();
        expect(hurricaneAt(storm, START - 1)).toBeUndefined();
        expect(hurricaneAt(storm, START + storm.durationMs)).toBeUndefined();
        expect(hurricaneAt(storm, START)?.progress).toBe(0);
    });

    it("blows round the centre anticlockwise in the north, turned in towards it by the inflow angle", () => {
        // Category 5 at the radius of the strongest winds: the motion of the storm is a small part of the wind there.
        const storm = hurricane({ category: 5 });
        // Heading north: before the eye, the map is to the north of the centre.
        const before = hurricaneAt(storm, at(storm, progressAtKm(-HURRICANE_RMAX_KM)));
        expect(before?.distanceKm).toBeCloseTo(HURRICANE_RMAX_KM, 6);
        // North of a centre, an anticlockwise wind goes west; turned in, it goes west-south-west: from 67.6°.
        expect(angleBetween(before?.windFrom ?? NaN, 90 - HURRICANE_INFLOW_DEGREES)).toBeLessThan(3);
    });

    it("turns the other way round in the southern hemisphere", () => {
        const storm = hurricane({ category: 5, southern: true });
        const before = hurricaneAt(storm, at(storm, progressAtKm(-HURRICANE_RMAX_KM)));
        // North of a centre, a clockwise wind goes east; turned in, east-south-east: from 292.4°.
        expect(angleBetween(before?.windFrom ?? NaN, 270 + HURRICANE_INFLOW_DEGREES)).toBeLessThan(3);
    });

    it("turns the wind round when the eye passes over the map, with the calm of the eye between", () => {
        const storm = hurricane({ category: 5 });
        const before = hurricaneAt(storm, at(storm, progressAtKm(-HURRICANE_RMAX_KM)));
        const eye = hurricaneAt(storm, at(storm, 0.5));
        const after = hurricaneAt(storm, at(storm, progressAtKm(HURRICANE_RMAX_KM)));
        expect(angleBetween(before?.windFrom ?? NaN, after?.windFrom ?? NaN)).toBeGreaterThan(170);
        expect(before?.after).toBe(false);
        expect(after?.after).toBe(true);
        expect(eye?.phase).toBe("eye");
        // In the eye only the motion of the storm is left.
        expect(eye?.windSpeed).toBeCloseTo(HURRICANE_MOTION_SHARE * HURRICANE_TRANSLATION_KMH, 6);
        expect(eye?.rainRate).toBe(0);
        expect(eye?.cloudCover).toBeLessThan(0.2);
        expect(before?.phase).toBe("wall");
        expect(before?.cloudCover).toBe(1);
    });

    it("brings the strongest wind of its category in the wall, no more than the motion of the storm over it", () => {
        const storm = hurricane();
        let strongest = 0;
        for (let i = 0; i < 2000; i++)
            strongest = Math.max(strongest, hurricaneAt(storm, at(storm, i / 2000))?.windSpeed ?? 0);
        expect(strongest).toBeGreaterThan(hurricaneMaxWind(4));
        expect(strongest).toBeLessThanOrEqual(hurricaneMaxWind(4) + HURRICANE_MOTION_SHARE * HURRICANE_TRANSLATION_KMH);
    });

    it("blows harder on the right of its track in the north, on the left in the south", () => {
        const strongest = (storm: Hurricane): number => {
            let most = 0;
            for (let i = 0; i < 2000; i++)
                most = Math.max(most, hurricaneAt(storm, at(storm, i / 2000))?.windSpeed ?? 0);
            return most;
        };
        expect(strongest(hurricane({ offsetKm: 20 }))).toBeGreaterThan(strongest(hurricane({ offsetKm: -20 })));
        expect(strongest(hurricane({ offsetKm: -20, southern: true }))).toBeGreaterThan(
            strongest(hurricane({ offsetKm: 20, southern: true })),
        );
    });

    it("never brings the eye over a map it passes far from", () => {
        const storm = hurricane({ offsetKm: 60 });
        for (let i = 0; i < 1000; i++) expect(hurricaneAt(storm, at(storm, i / 1000))?.phase).not.toBe("eye");
    });

    it("begins and ends with a light wind, faded in from the weather of the map", () => {
        const storm = hurricane();
        const first = hurricaneAt(storm, START);
        expect(first?.share).toBe(0);
        // Out of the winds of a tropical storm (63 km/h, 34 kt): the passage begins and ends beyond them.
        expect(first?.windSpeed).toBeLessThan(63);
        const base = { temperature: 26, humidity: 70, windSpeed: 10, windFrom: 315 };
        expect(hurricaneConditions(base, storm, START)).toEqual(base);
        const second = hurricaneConditions(base, storm, START + 1000);
        expect(Math.abs(second.windSpeed - base.windSpeed)).toBeLessThan(1);
        expect(angleBetween(second.windFrom, base.windFrom)).toBeLessThan(2);
        // Within the passage, the storm alone.
        const middle = hurricaneConditions(base, storm, at(storm, 0.3));
        expect(middle.windSpeed).toBeCloseTo(hurricaneAt(storm, at(storm, 0.3))?.windSpeed ?? NaN, 6);
        expect(middle.humidity).toBe(95);
        expect(middle.temperature).toBe(26);
        // Outside the passage, the room.
        expect(hurricaneConditions(base, storm, START + storm.durationMs)).toEqual(base);
        expect(hurricaneConditions(base, undefined, START)).toEqual(base);
    });
});

describe("the rain of a hurricane", () => {
    it("is the mean of its category at the radius of the strongest winds (Lonfat et al. 2004), none in the eye", () => {
        expect(hurricaneMeanRain(1, HURRICANE_RMAX_KM)).toBeCloseTo(7, 10);
        expect(hurricaneMeanRain(4, HURRICANE_RMAX_KM)).toBeCloseTo(12, 10);
        expect(hurricaneMeanRain(4, 0.5 * HURRICANE_RMAX_KM)).toBe(0);
        expect(hurricaneMeanRain(4, 300)).toBeLessThan(2);
    });

    it("falls in spiral bands that keep its mean round a circle", () => {
        for (const km of [60, 150, 300]) {
            let sum = 0;
            for (let i = 0; i < 360; i++) sum += bandShare(km, (i * Math.PI) / 180, false);
            expect(sum / 360).toBeCloseTo(1, 6);
        }
        // Wet bands and dry gaps cross the map as the storm comes.
        const storm = hurricane();
        const rates: number[] = [];
        for (let i = 0; i < 400; i++) rates.push(hurricaneAt(storm, at(storm, (i / 400) * 0.4))?.rainRate ?? 0);
        let bands = 0;
        for (let i = 1; i < rates.length - 1; i++) if (rates[i] > rates[i - 1] && rates[i] >= rates[i + 1]) bands++;
        expect(bands).toBeGreaterThanOrEqual(2);
    });

    it("gives the ground the total of a real passage, whatever the speed of its water", () => {
        const storm = hurricane();
        const total = (groundSpeed: number): number => {
            let mm = 0;
            const stepMs = 1000;
            for (let t = START; t < START + storm.durationMs; t += stepMs) {
                // A ground `groundSpeed` times faster than reality lives that many hours of rain each real hour.
                mm += (skyRainUnder(0, storm, t, groundSpeed) * groundSpeed * stepMs) / 3_600_000;
            }
            return mm;
        };
        const real = total(1);
        expect(total(60)).toBeCloseTo(real, 6);
        // Kraft's rule of thumb, 100 / speed in knots, inches: an upper bound (Lonfat et al. find rates 2.5 to 3
        // times lower than the ones commonly used).
        const kraftMm = (100 / (HURRICANE_TRANSLATION_KMH / 1.852)) * 25.4;
        expect(real).toBeLessThan(kraftMm);
        expect(real).toBeGreaterThan(kraftMm / 2);
    });

    it("takes the place of the rain of the map, which comes back when it ends", () => {
        const storm = hurricane();
        expect(skyRainUnder(2, storm, at(storm, 0.5))).toBe(0);
        expect(skyRainUnder(2, storm, START)).toBe(2);
        expect(skyRainUnder(2, storm, START + storm.durationMs)).toBe(2);
    });
});

describe("blendedWind", () => {
    it("mixes two winds as vectors", () => {
        expect(
            blendedWind({ windSpeed: 10, windFrom: 90 }, { windSpeed: 10, windFrom: 270 }, 0.5).windSpeed,
        ).toBeCloseTo(0, 10);
        const half = blendedWind({ windSpeed: 10, windFrom: 0 }, { windSpeed: 10, windFrom: 90 }, 0.5);
        expect(half.windFrom).toBeCloseTo(45, 6);
    });
});

describe("hurricaneTrack", () => {
    it("keeps what a player asks for within bounds", () => {
        expect(hurricaneTrack({ category: 9, minutes: 1, offsetKm: 500, heading: -10 }, true)).toEqual({
            category: 5,
            durationMs: 5 * 60_000,
            offsetKm: 60,
            heading: 350,
            southern: true,
        });
        expect(hurricaneTrack({}, false)).toEqual({
            category: 4,
            durationMs: 30 * 60_000,
            offsetKm: 0,
            heading: 290,
            southern: false,
        });
    });
});

describe("a fire under a hurricane", () => {
    it("goes out under the rain of the wall, which its wind alone would have spread", () => {
        const storm = hurricane();
        /** A dry meadow on fire, stepped for 6 s under the wind of the wall, with its rain or without it. */
        const burningAfter = (rains: boolean): number => {
            const meadow = new Meadow({ width: 21, height: 21 }, undefined, undefined);
            for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) meadow.set(x, y, 0.1, 1, 1);
            meadow.ignite(10, 10, 3);
            for (let step = 0; step < 3; step++) {
                const epoch = at(storm, 0.45) + step * MEADOW_STEP_SECONDS * 1000;
                const now = hurricaneAt(storm, epoch);
                meadow.step({
                    seconds: MEADOW_STEP_SECONDS,
                    rainMmPerHour: rains ? skyRainUnder(0, storm, epoch) : 0,
                    daylight: true,
                    season: Season.Summer,
                    waterAt: () => 0,
                    random: () => 0.5,
                    fireDanger: 1,
                    windSpeed: now?.windSpeed ?? 0,
                    windFrom: now?.windFrom ?? 0,
                });
            }
            return meadow.burning();
        };
        expect(burningAfter(false)).toBeGreaterThan(0);
        expect(burningAfter(true)).toBe(0);
    });
});
