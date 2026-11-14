import { describe, expect, it } from "vitest";
import { Season, WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import {
    AUTO_CLOUDINESS,
    autoWeatherAt,
    cloudinessAt,
} from "../../../../../src/front/Phaser/Game/Weather/WeatherSchedule";

const MINUTE = 60 * 1000;
const SLOT_MS = 30 * MINUTE;
const DAY_MS = 24 * 60 * MINUTE;
/** 2026-01-01 00:00 in Paris. */
const START = Date.parse("2025-12-31T23:00:00Z");

const parisMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", month: "numeric" });

function seasonOf(at: Date): Season {
    const month = Number(parisMonth.format(at));
    if (month >= 3 && month <= 5) return Season.Spring;
    if (month >= 6 && month <= 8) return Season.Summer;
    if (month >= 9 && month <= 11) return Season.Autumn;
    return Season.Winter;
}

/** Share (in %) of the clear slots of a year that carry clouds, per season, read mid-slot (fade over). */
function cloudShares(auto?: AutoWeatherSettings): Record<Season, number> {
    const clear: Record<Season, number> = { winter: 0, spring: 0, summer: 0, autumn: 0 };
    const cloudy: Record<Season, number> = { winter: 0, spring: 0, summer: 0, autumn: 0 };
    for (let t = START + 15 * MINUTE; t < START + 365 * DAY_MS; t += SLOT_MS) {
        const at = new Date(t);
        if (autoWeatherAt(at, auto) !== WeatherType.Clear) continue;
        const season = seasonOf(at);
        clear[season]++;
        if (cloudinessAt(at, auto) > 0) cloudy[season]++;
    }
    return {
        winter: (100 * cloudy.winter) / clear.winter,
        spring: (100 * cloudy.spring) / clear.spring,
        summer: (100 * cloudy.summer) / clear.summer,
        autumn: (100 * cloudy.autumn) / clear.autumn,
    };
}

describe("cloudinessAt (automatic weather)", () => {
    it("puts clouds on the share of clear slots decided per season (Normale), within 5 points", () => {
        const shares = cloudShares();
        expect(Math.abs(shares.winter - 50)).toBeLessThanOrEqual(5);
        expect(Math.abs(shares.spring - 35)).toBeLessThanOrEqual(5);
        expect(Math.abs(shares.summer - 20)).toBeLessThanOrEqual(5);
        expect(Math.abs(shares.autumn - 40)).toBeLessThanOrEqual(5);
    });

    it("follows the frequency: half in Calme, × 1.6 in Agitée", () => {
        const include = [WeatherType.Rain, WeatherType.Snow, WeatherType.Storm, WeatherType.Fog];
        expect(Math.abs(cloudShares({ frequency: "calm", include }).summer - 10)).toBeLessThanOrEqual(5);
        expect(Math.abs(cloudShares({ frequency: "stormy", include }).summer - 32)).toBeLessThanOrEqual(5);
    });

    it("only on clear slots, at the automatic intensity once faded in, never when the map turns clouds off", () => {
        const auto: AutoWeatherSettings = { frequency: "normal", include: [WeatherType.Rain, WeatherType.Fog] };
        let clouded = 0;
        for (let t = START + 15 * MINUTE; t < START + 30 * DAY_MS; t += SLOT_MS) {
            const at = new Date(t);
            const cloudiness = cloudinessAt(at, auto);
            if (autoWeatherAt(at, auto) !== WeatherType.Clear) expect(cloudiness).toBe(0);
            else expect([0, AUTO_CLOUDINESS]).toContain(cloudiness);
            if (cloudiness > 0) clouded++;
            expect(cloudinessAt(at, { ...auto, clouds: false })).toBe(0);
        }
        expect(clouded).toBeGreaterThan(0);
    });

    it("never jumps: clouds come and go over three minutes, midnight included", () => {
        const step = 10_000;
        const from = Date.parse("2026-01-10T00:00:00Z");
        let last = cloudinessAt(new Date(from));
        let changed = false;
        for (let t = from + step; t < from + 3 * DAY_MS; t += step) {
            const cloudiness = cloudinessAt(new Date(t));
            if (cloudiness !== last) changed = true;
            expect(Math.abs(cloudiness - last)).toBeLessThanOrEqual((AUTO_CLOUDINESS * step) / (3 * MINUTE) + 1e-9);
            last = cloudiness;
        }
        expect(changed).toBe(true);
    });
});
