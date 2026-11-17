import { describe, expect, it } from "vitest";
import {
    moonEclipticAt,
    moonEquatorialAt,
    moonPhaseAt,
    moonPositionAt,
} from "../../../../../src/front/Phaser/Game/Night/MoonClock";

const MINUTE = 60_000;
const paris = { latitude: 48.8566, longitude: 2.3522 };
const sydney = { latitude: -33.8688, longitude: 151.2093 };

/** Shortest angle between two azimuths, in degrees. */
const azimuthGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/*
 * Meeus, "Astronomical Algorithms" (2nd ed.), example 47.a: the Moon on 1992 April 12 at 0h TD. The values are those
 * reproduced by the PyMeeus library from the book (https://pymeeus.readthedocs.io/en/stable/examples/ex-Moon.html, read
 * on 2026-11-17), not read in the book itself: geocentric longitude 133.162655°, latitude -3.229126°, distance
 * 368409.7 km, equatorial horizontal parallax 0.99199°; apparent right ascension 134.688469° and declination
 * 13.768367°; approximate illuminated fraction 0.68 (example 48.a).
 *
 * Tolerances: the series keeps the terms of tables 47.A and 47.B of 0.001° and more; the terms left out add up to
 * 0.0105° in longitude and 0.0103° in latitude at most, and 32 km in distance. The instant is given in UT, 1 minute
 * from TD in 1992 (the Moon moves 0.008° in that time). The published right ascension and declination include the
 * nutation (0.005° here), which is left out.
 */
describe("moonEclipticAt / moonEquatorialAt, Meeus example 47.a", () => {
    const at = new Date(Date.UTC(1992, 3, 12));

    it("finds the geocentric ecliptic position and the distance", () => {
        const moon = moonEclipticAt(at);
        expect(Math.abs(moon.longitude - 133.162655)).toBeLessThanOrEqual(0.02);
        expect(Math.abs(moon.latitude - -3.229126)).toBeLessThanOrEqual(0.015);
        expect(Math.abs(moon.distance - 368409.7)).toBeLessThanOrEqual(40);
        expect(Math.abs(moon.parallax - 0.99199)).toBeLessThanOrEqual(0.0002);
    });

    it("finds the right ascension and declination", () => {
        const moon = moonEquatorialAt(at);
        expect(Math.abs(moon.rightAscension - 134.688469)).toBeLessThanOrEqual(0.03);
        expect(Math.abs(moon.declination - 13.768367)).toBeLessThanOrEqual(0.03);
    });

    it("finds the illuminated fraction of example 48.a", () => {
        expect(Math.abs(moonPhaseAt(at).illuminated - 0.68)).toBeLessThanOrEqual(0.01);
    });
});

/** The instant, between `from` and `to`, at which the Moon's topocentric centre crosses `elevation` (bisection). */
function crossing(from: Date, to: Date, place: { latitude: number; longitude: number }, elevation: number): Date {
    let low = from.getTime();
    let high = to.getTime();
    const above = (time: number): boolean => moonPositionAt(new Date(time), place).elevation > elevation;
    const lowAbove = above(low);
    expect(above(high)).not.toBe(lowAbove);
    for (let step = 0; step < 40; step++) {
        const middle = (low + high) / 2;
        if (above(middle) === lowAbove) low = middle;
        else high = middle;
    }
    return new Date((low + high) / 2);
}

/*
 * Moonrise and moonset: the upper limb on the horizon, refraction included (timeanddate.com says its times account
 * for it), i.e. the centre at -(34′ of refraction + about 15′ of semi-diameter) = -0.83°. A difference of 1′ of
 * semi-diameter moves the event by a few seconds only.
 */
const HORIZON = -0.83;
/** Published times are rounded to the minute, azimuths to the degree; the series is good to about 0.02°. */
const TIME_TOLERANCE_MINUTES = 3;
const AZIMUTH_TOLERANCE = 1.5;

function expectEvent(
    place: { latitude: number; longitude: number },
    published: string,
    azimuth: number,
    rising: boolean,
): void {
    const time = new Date(published);
    const found = crossing(
        new Date(time.getTime() - 30 * MINUTE),
        new Date(time.getTime() + 30 * MINUTE),
        place,
        HORIZON,
    );
    expect(Math.abs(found.getTime() - time.getTime()) / MINUTE).toBeLessThanOrEqual(TIME_TOLERANCE_MINUTES);
    expect(azimuthGap(moonPositionAt(found, place).azimuth, azimuth)).toBeLessThanOrEqual(AZIMUTH_TOLERANCE);
    const before = moonPositionAt(new Date(found.getTime() - 10 * MINUTE), place).elevation;
    const after = moonPositionAt(new Date(found.getTime() + 10 * MINUTE), place).elevation;
    expect(after > before).toBe(rising);
}

/** Highest of the Moon at its meridian passage, refraction (0.02° at 45°, 0.07° at 13°) and rounding included. */
function expectMeridian(place: { latitude: number; longitude: number }, published: string, altitude: number): void {
    const moon = moonPositionAt(new Date(published), place);
    expect(Math.abs(moon.elevation - altitude)).toBeLessThanOrEqual(0.3);
    // On the meridian: due south of Paris, due north of Sydney. The passage is rounded to the minute: half a minute is
    // 0.125° of hour angle, which turns the azimuth all the more as the Moon is close to the zenith (1.1° at 83.7°).
    const rounding = 0.125 / Math.sin(((90 - altitude) * Math.PI) / 180);
    expect(azimuthGap(moon.azimuth, place.latitude > 0 ? 180 : 0)).toBeLessThanOrEqual(1 + rounding);
}

/*
 * Paris, local time CET (UTC+1), as published by timeanddate.com "Moonrise, Moonset, and Phase Calendar" for Paris,
 * France (https://www.timeanddate.com/moon/france/paris?month=11&year=2026), read on 2026-11-17:
 * - 2026-11-12: moonrise 11:30 at 135°, moonset 18:49 at 225°, meridian passing 15:09 at 12.7°, illumination 10.1 %;
 * - 2026-11-20: moonrise 14:42 at 83°, moonset 02:48 at 272°, meridian passing 21:15 at 46.8°, illumination 81.8 %;
 * - phases: new moon 2026-11-09 08:02, first quarter 2026-11-17 12:47, full moon 2026-11-24 15:53.
 */
describe("moonPositionAt, on the Moon of Paris (published by timeanddate.com)", () => {
    it("rises at 135° (11:30) and sets at 225° (18:49) on 2026-11-12", () => {
        expectEvent(paris, "2026-11-12T10:30:00Z", 135, true);
        expectEvent(paris, "2026-11-12T17:49:00Z", 225, false);
    });

    it("stands 12.7° high at its meridian passage of 2026-11-12 (15:09): the parallax lowers a low Moon by 1°", () => {
        expectMeridian(paris, "2026-11-12T14:09:00Z", 12.7);
    });

    it("sets at 272° (02:48), rises at 83° (14:42) and stands 46.8° high (21:15) on 2026-11-20", () => {
        expectEvent(paris, "2026-11-20T01:48:00Z", 272, false);
        expectEvent(paris, "2026-11-20T13:42:00Z", 83, true);
        expectMeridian(paris, "2026-11-20T20:15:00Z", 46.8);
    });
});

/*
 * Sydney, local time AEDT (UTC+11), as published by timeanddate.com for Sydney, Australia
 * (https://www.timeanddate.com/moon/australia/sydney?month=11&year=2026), read on 2026-11-17:
 * - 2026-11-12: moonrise 07:15 at 124°, moonset 22:30 at 236°, meridian passing 14:52 at 83.7°, illumination 7.8 %;
 * - 2026-11-20: moonset 02:30 at 269°, moonrise 14:56 at 87°, meridian passing 21:00 at 51.9°, illumination 78.2 %;
 * - phases: new moon 2026-11-09 18:02, first quarter 2026-11-17 22:47, full moon 2026-11-25 01:53 (the same instants
 *   as in Paris, 10 hours later on the clock).
 */
describe("moonPositionAt, on the Moon of Sydney (published by timeanddate.com)", () => {
    it("rises at 124° (07:15) and sets at 236° (22:30) on 2026-11-12", () => {
        expectEvent(sydney, "2026-11-11T20:15:00Z", 124, true);
        expectEvent(sydney, "2026-11-12T11:30:00Z", 236, false);
    });

    it("passes north of Sydney 83.7° high (14:52) on 2026-11-12", () => {
        expectMeridian(sydney, "2026-11-12T03:52:00Z", 83.7);
    });

    it("sets at 269° (02:30), rises at 87° (14:56) and stands 51.9° high (21:00) on 2026-11-20", () => {
        expectEvent(sydney, "2026-11-19T15:30:00Z", 269, false);
        expectEvent(sydney, "2026-11-20T03:56:00Z", 87, true);
        expectMeridian(sydney, "2026-11-20T10:00:00Z", 51.9);
    });
});

/*
 * The illuminated fraction, at the meridian passages published above (timeanddate.com gives it at lunar noon). The
 * approximate formula of Meeus (48.4) is good to about 0.01.
 */
describe("moonPhaseAt (published by timeanddate.com)", () => {
    it("matches the illumination published for Paris and Sydney", () => {
        expect(Math.abs(moonPhaseAt(new Date("2026-11-12T14:09:00Z")).illuminated - 0.101)).toBeLessThanOrEqual(0.015);
        expect(Math.abs(moonPhaseAt(new Date("2026-11-20T20:15:00Z")).illuminated - 0.818)).toBeLessThanOrEqual(0.015);
        expect(Math.abs(moonPhaseAt(new Date("2026-11-12T03:52:00Z")).illuminated - 0.078)).toBeLessThanOrEqual(0.015);
        expect(Math.abs(moonPhaseAt(new Date("2026-11-20T10:00:00Z")).illuminated - 0.782)).toBeLessThanOrEqual(0.015);
    });

    it("is dark at the new moon (2026-11-09 07:02 UTC) and full at the full moon (2026-11-24 14:53 UTC)", () => {
        expect(moonPhaseAt(new Date("2026-11-09T07:02:00Z")).illuminated).toBeLessThanOrEqual(0.005);
        expect(moonPhaseAt(new Date("2026-11-24T14:53:00Z")).illuminated).toBeGreaterThanOrEqual(0.995);
    });

    it("is half lit at the first quarter (2026-11-17 11:47 UTC), and waxing between the new and the full moon", () => {
        expect(Math.abs(moonPhaseAt(new Date("2026-11-17T11:47:00Z")).illuminated - 0.5)).toBeLessThanOrEqual(0.01);
        expect(moonPhaseAt(new Date("2026-11-10T00:00:00Z")).waxing).toBe(true);
        expect(moonPhaseAt(new Date("2026-11-17T11:47:00Z")).waxing).toBe(true);
        expect(moonPhaseAt(new Date("2026-11-24T12:00:00Z")).waxing).toBe(true);
        expect(moonPhaseAt(new Date("2026-11-24T18:00:00Z")).waxing).toBe(false);
        expect(moonPhaseAt(new Date("2026-11-30T00:00:00Z")).waxing).toBe(false);
    });
});

/*
 * Invariants, not published values: at the new moon the Moon stands about where the Sun is in the sky (within its
 * latitude of 5° and the parallax of 1°), at the full moon about opposite to it.
 */
describe("moonPositionAt, invariants", () => {
    it("stands next to the sun at the new moon and opposite it at the full moon", async () => {
        const { sunPositionAt } = await import("../../../../../src/front/Phaser/Game/Night/NightClock");
        const separation = (date: Date): number => {
            const sun = sunPositionAt(date, paris);
            const moon = moonPositionAt(date, paris);
            const toVector = (p: { elevation: number; azimuth: number }): number[] => {
                const e = (p.elevation * Math.PI) / 180;
                const a = (p.azimuth * Math.PI) / 180;
                return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
            };
            const [s, m] = [toVector(sun), toVector(moon)];
            return (Math.acos(s[0] * m[0] + s[1] * m[1] + s[2] * m[2]) * 180) / Math.PI;
        };
        expect(separation(new Date("2026-11-09T07:02:00Z"))).toBeLessThanOrEqual(7);
        expect(separation(new Date("2026-11-24T14:53:00Z"))).toBeGreaterThanOrEqual(173);
    });
});
