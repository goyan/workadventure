import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_WEATHER, WeatherType } from "@workadventure/map-editor";
import type { AutoWeatherSettings } from "@workadventure/map-editor";
import {
    autoWeatherAt,
    autoWeatherChanges,
    FOG_UNTIL_HOUR,
    FREQUENCY_FACTORS,
    PERSISTENCE,
    scheduleComputations,
    slotStart,
    STORM_HOURS,
} from "../../../../../src/front/Phaser/Game/Weather/WeatherSchedule";

const SLOT_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 2026-01-01 00:00 in Paris (UTC+1 in winter). */
const START = Date.parse("2025-12-31T23:00:00Z");

const parisParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
});

function paris(date: Date): { month: number; hour: number; minute: number } {
    const parts = Object.fromEntries(parisParts.formatToParts(date).map((part) => [part.type, part.value]));
    return { month: Number(parts.month), hour: Number(parts.hour), minute: Number(parts.minute) };
}

type Sample = { at: Date; month: number; hour: number; minute: number; weather: WeatherType };

/** Every 30-minute instant over `days` days from 2026-01-01 00:00 Paris. */
function simulate(days: number, auto?: AutoWeatherSettings, start = START): Sample[] {
    const samples: Sample[] = [];
    for (let t = start; t < start + days * DAY_MS; t += SLOT_MS) {
        const at = new Date(t);
        samples.push({ at, ...paris(at), weather: autoWeatherAt(at, auto) });
    }
    return samples;
}

function seasonOf(month: number): "winter" | "spring" | "summer" | "autumn" {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
}

function share(samples: Sample[], weather: WeatherType): number {
    if (samples.length === 0) return 0;
    return samples.filter((sample) => sample.weather === weather).length / samples.length;
}

const year = simulate(400);
const bySeason = (season: string) => year.filter((sample) => seasonOf(sample.month) === season);

describe("seasonal weather schedule", () => {
    it("exposes the binding constants", () => {
        expect(PERSISTENCE).toBe(0.6);
        expect(FOG_UNTIL_HOUR).toBe(11);
        expect(STORM_HOURS).toEqual([13, 21]);
        expect(FREQUENCY_FACTORS).toEqual({ calm: 0.5, normal: 1, stormy: 1.6 });
    });

    it("is the same for everyone", () => {
        const reordered: AutoWeatherSettings = {
            frequency: "normal",
            include: [WeatherType.Fog, WeatherType.Storm, WeatherType.Snow, WeatherType.Rain],
        };
        const day = Date.parse("2026-02-10T23:00:00Z");
        for (let slot = 0; slot < 48; slot++) {
            const at = new Date(day + slot * SLOT_MS);
            const first = autoWeatherAt(at);
            expect(autoWeatherAt(new Date(at.getTime()))).toBe(first);
            expect(autoWeatherAt(at, DEFAULT_AUTO_WEATHER)).toBe(first);
            expect(autoWeatherAt(at, reordered)).toBe(first);
        }
    });

    it("follows the season", () => {
        const winter = bySeason("winter");
        const spring = bySeason("spring");
        const summer = bySeason("summer");
        const autumn = bySeason("autumn");

        const clear = [winter, spring, summer, autumn].map((samples) => share(samples, WeatherType.Clear));
        expect(Math.max(...clear)).toBe(clear[2]);

        expect(year.filter((s) => s.month >= 4 && s.month <= 10 && s.weather === WeatherType.Snow)).toHaveLength(0);
        expect(share(winter, WeatherType.Snow)).toBeGreaterThan(share(autumn, WeatherType.Snow));

        expect(share(summer, WeatherType.Storm)).toBeGreaterThan(share(spring, WeatherType.Storm));
        expect(share(spring, WeatherType.Storm)).toBeGreaterThan(share(autumn, WeatherType.Storm));
        expect(share(winter, WeatherType.Storm)).toBe(0);

        expect(share(autumn, WeatherType.Fog)).toBeGreaterThan(share(summer, WeatherType.Fog));
        expect(year.filter((s) => s.hour >= 11 && s.weather === WeatherType.Fog)).toHaveLength(0);
    });

    it("never snows from April to October", () => {
        const snowy = simulate(400, { frequency: "stormy", include: [WeatherType.Snow] });
        expect(snowy.some((s) => s.weather === WeatherType.Snow)).toBe(true);
        expect(snowy.filter((s) => s.month >= 4 && s.month <= 10 && s.weather === WeatherType.Snow)).toHaveLength(0);
    });

    it("storms only from 13:00 to 21:00", () => {
        const storms = year.filter((s) => s.weather === WeatherType.Storm);
        expect(storms.length).toBeGreaterThan(0);
        for (const storm of storms) {
            expect(storm.hour).toBeGreaterThanOrEqual(13);
            expect(storm.hour).toBeLessThan(21);
        }
        // an ongoing storm may persist instead of turning to rain after one slot
        const lasting = year.filter(
            (s, i) => i > 0 && s.weather === WeatherType.Storm && year[i - 1].weather === WeatherType.Storm,
        );
        expect(lasting.length).toBeGreaterThan(storms.length / 3);
    });

    it("fog only before 11:00", () => {
        const fogs = year.filter((s) => s.weather === WeatherType.Fog);
        expect(fogs.length).toBeGreaterThan(0);
        for (const fog of fogs) expect(fog.hour).toBeLessThan(11);
    });

    it("never goes straight between snow and storm", () => {
        const stormy = simulate(400, { frequency: "stormy", include: [WeatherType.Snow, WeatherType.Storm] });
        for (const samples of [year, stormy]) {
            for (let i = 1; i < samples.length; i++) {
                const pair = [samples[i - 1].weather, samples[i].weather];
                expect(pair).not.toEqual([WeatherType.Snow, WeatherType.Storm]);
                expect(pair).not.toEqual([WeatherType.Storm, WeatherType.Snow]);
                if (samples[i].weather === WeatherType.Storm) {
                    expect([WeatherType.Clear, WeatherType.Rain, WeatherType.Storm]).toContain(samples[i - 1].weather);
                }
            }
        }
    });

    it("lasts", () => {
        const month = simulate(30);
        let episodes = 1;
        for (let i = 1; i < month.length; i++) if (month[i].weather !== month[i - 1].weather) episodes++;
        expect(month.length / episodes).toBeGreaterThan(1.5);
    });

    it("frequency changes the share of bad weather", () => {
        const bad = (frequency: AutoWeatherSettings["frequency"]) =>
            1 - share(simulate(200, { ...DEFAULT_AUTO_WEATHER, frequency }), WeatherType.Clear);
        const calm = bad("calm");
        const normal = bad("normal");
        const stormy = bad("stormy");
        expect(calm).toBeLessThan(normal);
        expect(normal).toBeLessThan(stormy);
    });

    it("never draws an excluded weather", () => {
        const cases: WeatherType[][] = [
            [WeatherType.Rain],
            [WeatherType.Storm],
            [WeatherType.Snow],
            [WeatherType.Fog],
            [WeatherType.Storm, WeatherType.Fog],
        ];
        for (const include of cases) {
            const samples = simulate(120, { frequency: "stormy", include });
            for (const sample of samples) expect([WeatherType.Clear, ...include]).toContain(sample.weather);
        }
    });

    it("stays clear with nothing included", () => {
        for (const sample of simulate(60, { frequency: "stormy", include: [] })) {
            expect(sample.weather).toBe(WeatherType.Clear);
        }
    });

    it("ignores clear, automatic and duplicates in include", () => {
        const noisy: AutoWeatherSettings = {
            frequency: "normal",
            include: [
                WeatherType.Clear,
                WeatherType.Automatic,
                WeatherType.Rain,
                WeatherType.Rain,
                WeatherType.Snow,
                WeatherType.Storm,
                WeatherType.Fog,
                WeatherType.Fog,
            ],
        };
        const clean = simulate(20);
        const noisySamples = simulate(20, noisy);
        expect(noisySamples.map((s) => s.weather)).toEqual(clean.map((s) => s.weather));
        expect(simulate(5, { frequency: "normal", include: [WeatherType.Clear, WeatherType.Automatic] })).toEqual(
            simulate(5, { frequency: "normal", include: [] }),
        );
    });

    it("continues across midnight", () => {
        // Persistence alone keeps 60 % of slots; redraws may land on the same weather, so the midnight
        // rate must match the rate of ordinary late-evening transitions (an independent day would not).
        const samples = simulate(200);
        const sameRate = (hour: number, minute: number) => {
            let same = 0;
            let total = 0;
            for (let i = 1; i < samples.length; i++) {
                if (samples[i].hour !== hour || samples[i].minute !== minute) continue;
                total++;
                if (samples[i].weather === samples[i - 1].weather) same++;
            }
            return same / total;
        };
        const midnight = sameRate(0, 0);
        const evening = (sameRate(23, 0) + sameRate(23, 30) + sameRate(22, 30)) / 3;
        expect(midnight).toBeGreaterThanOrEqual(PERSISTENCE - 0.1);
        expect(Math.abs(midnight - evening)).toBeLessThanOrEqual(0.1);
    });

    it("survives the daylight saving days", () => {
        for (const [from, to] of [
            ["2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
            ["2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"],
        ]) {
            for (let t = Date.parse(from); t < Date.parse(to); t += SLOT_MS / 2) {
                const at = new Date(t);
                const weather = autoWeatherAt(at);
                expect(Object.values(WeatherType)).toContain(weather);
                expect(weather).not.toBe(WeatherType.Automatic);
                expect(autoWeatherAt(new Date(t))).toBe(weather);
                const start = slotStart(at);
                expect(start.getTime()).toBeLessThanOrEqual(t);
                expect(t - start.getTime()).toBeLessThan(SLOT_MS);
                expect(autoWeatherAt(start)).toBe(weather);
            }
        }
    });

    it("starts slots on Paris half hours", () => {
        expect(slotStart(new Date("2026-07-14T10:47:12.345Z")).toISOString()).toBe("2026-07-14T10:30:00.000Z");
        expect(slotStart(new Date("2026-01-14T10:00:00.000Z")).toISOString()).toBe("2026-01-14T10:00:00.000Z");
    });

    it("computes a day once", () => {
        const before = scheduleComputations();
        const day = Date.parse("2031-05-04T22:00:00Z");
        for (let i = 0; i < 500; i++) autoWeatherAt(new Date(day + (i % 48) * SLOT_MS + 1000));
        expect(scheduleComputations() - before).toBeLessThanOrEqual(2);
    });

    it("lists the next changes consistently", () => {
        for (let day = 0; day < 30; day++) {
            const date = new Date(START + day * DAY_MS + 9 * 60 * 60 * 1000 + 7 * 60 * 1000);
            const changes = autoWeatherChanges(date, undefined, 3);
            expect(changes.length).toBeLessThanOrEqual(3);
            let previous = date.getTime();
            for (const change of changes) {
                expect(change.at.getTime()).toBeGreaterThan(previous);
                expect(autoWeatherAt(change.at)).toBe(change.weather);
                expect(autoWeatherAt(new Date(change.at.getTime() - 1))).not.toBe(change.weather);
                // nothing changed in between
                for (let t = previous; t < change.at.getTime(); t += SLOT_MS) {
                    expect(autoWeatherAt(new Date(t))).toBe(autoWeatherAt(new Date(previous)));
                }
                previous = change.at.getTime();
            }
        }
        expect(autoWeatherChanges(new Date(START), { frequency: "normal", include: [] }, 3)).toEqual([]);
    });
});
