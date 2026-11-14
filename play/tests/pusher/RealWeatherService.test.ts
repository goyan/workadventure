import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearchService, RealWeatherService } from "../../src/pusher/services/RealWeatherService";
import { OPEN_METEO_ASKED_AT, OPEN_METEO_PARIS } from "../common/OpenMeteoFixture";

/** The real Open-Meteo answer for Paris (2026-11-14), with every quarter hour given `code` if any. */
function openMeteo(code?: number): Response {
    const timeline = OPEN_METEO_PARIS.minutely_15;
    return new Response(
        JSON.stringify({
            ...OPEN_METEO_PARIS,
            minutely_15: {
                ...timeline,
                weather_code: code === undefined ? timeline.weather_code : timeline.weather_code.map(() => code),
            },
        }),
    );
}

const MINUTE = 60_000;
const NOW = OPEN_METEO_ASKED_AT * 1000;
const FIRST = OPEN_METEO_PARIS.minutely_15.time[0] * 1000;

function urlOf(input: string | URL | Request): URL {
    return input instanceof Request ? new URL(input.url) : new URL(input);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("RealWeatherService", () => {
    it("asks Open-Meteo for the quarter-hour timeline in Paris, once for simultaneous colleagues", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(openMeteo());
        const service = new RealWeatherService(fetchFn, () => NOW);
        const [first, second] = await Promise.all([service.get(), service.get()]);
        expect(first.slots).toHaveLength(32);
        expect(first.slots[8]).toEqual({ at: 1794654900000, weather: "clear", temperature: 8.2 });
        expect(second).toEqual(first);
        expect(fetchFn).toHaveBeenCalledOnce();
        const url = urlOf(fetchFn.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
        expect(url.searchParams.get("minutely_15")).toBe("weather_code,temperature_2m");
        expect(url.searchParams.get("past_minutely_15")).toBe("8");
        expect(url.searchParams.get("forecast_minutely_15")).toBe("24");
        expect(url.searchParams.get("timeformat")).toBe("unixtime");
        expect(Number(url.searchParams.get("latitude"))).toBeCloseTo(48.8566);
        expect(Number(url.searchParams.get("longitude"))).toBeCloseTo(2.3522);
    });

    it("keeps its timeline half an hour, then asks again", async () => {
        let now = NOW;
        const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(openMeteo()));
        const service = new RealWeatherService(fetchFn, () => now);
        await service.get();
        now = NOW + 29 * MINUTE;
        await service.get();
        expect(fetchFn).toHaveBeenCalledOnce();
        now = NOW + 30 * MINUTE;
        await service.get();
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("never changes a quarter hour already begun: a new forecast only changes the ones to come", async () => {
        let now = NOW;
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(openMeteo()).mockResolvedValueOnce(openMeteo(61));
        const service = new RealWeatherService(fetchFn, () => now);
        await service.get();
        now = NOW + 30 * MINUTE;
        const { slots } = await service.get();
        const begun = slots.filter((slot) => slot.at <= now);
        const coming = slots.filter((slot) => slot.at > now);
        expect(begun.length).toBeGreaterThan(0);
        expect(coming.length).toBeGreaterThan(0);
        expect(begun.every((slot) => slot.weather === "clear")).toBe(true);
        expect(coming.every((slot) => slot.weather === "rain")).toBe(true);
    });

    it("keeps its timeline through a failure, and forgets the quarter hours ended over two hours ago", async () => {
        let now = NOW;
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(openMeteo())
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValue(new Response(JSON.stringify({ current: { weather_code: 0 } })));
        const service = new RealWeatherService(fetchFn, () => now);
        expect((await service.get()).slots).toHaveLength(32);
        now = NOW + 30 * MINUTE;
        const afterFailure = (await service.get()).slots;
        expect(afterFailure[afterFailure.length - 1].at).toBe(1794675600000);
        expect(afterFailure[0].at).toBeGreaterThanOrEqual(NOW - 105 * MINUTE);
        expect(afterFailure.some((slot) => slot.at === FIRST)).toBe(false);
        now = NOW + 60 * MINUTE;
        await service.get();
        now = NOW + 90 * MINUTE;
        await service.get();
        // A failed attempt is not retried at once: one call per half hour at most.
        await service.get();
        expect(fetchFn).toHaveBeenCalledTimes(4);
    });

    it("gives an empty timeline until Open-Meteo answers something usable", async () => {
        const service = new RealWeatherService(
            vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 503 })),
            () => NOW,
        );
        expect(await service.get()).toEqual({ slots: [] });
    });
});

describe("RealWeatherService, place of the map", () => {
    it("asks for the given place, and keeps one timeline per place (to about a kilometre)", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
            const url = urlOf(input);
            return Promise.resolve(openMeteo(url.searchParams.get("latitude") === "45.75" ? 61 : 0));
        });
        const service = new RealWeatherService(fetchFn, () => NOW);
        expect((await service.get({ latitude: 45.74906, longitude: 4.84789 })).slots[8].weather).toBe("rain");
        expect((await service.get({ latitude: 45.7501, longitude: 4.8502 })).slots[8].weather).toBe("rain");
        expect((await service.get()).slots[8].weather).toBe("clear");
        expect(fetchFn).toHaveBeenCalledTimes(2);
        const lyon = urlOf(fetchFn.mock.calls[0][0]);
        expect(lyon.searchParams.get("longitude")).toBe("4.85");
    });
});

describe("PlaceSearchService", () => {
    function geocoding(results?: unknown[]): Response {
        return new Response(JSON.stringify(results ? { results, generationtime_ms: 0.1 } : { generationtime_ms: 0.1 }));
    }

    it("finds towns in French with a readable name, through the Open-Meteo geocoding", async () => {
        // Shape of a real answer for "Lyon" (2026-11-14), trimmed.
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
            geocoding([
                {
                    id: 2996944,
                    name: "Lyon",
                    latitude: 45.74906,
                    longitude: 4.84789,
                    country_code: "FR",
                    country: "France",
                    admin1: "Auvergne-Rhône-Alpes",
                    timezone: "Europe/Paris",
                },
                { id: 1, name: "Lyon Station", latitude: 40.3, longitude: -76.4, country: "États-Unis" },
            ]),
        );
        const service = new PlaceSearchService(fetchFn);
        expect(await service.search("  Lyon ")).toEqual([
            { name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.74906, longitude: 4.84789 },
            { name: "Lyon Station, États-Unis", latitude: 40.3, longitude: -76.4 },
        ]);
        const url = urlOf(fetchFn.mock.calls[0][0]);
        expect(url.origin + url.pathname).toBe("https://geocoding-api.open-meteo.com/v1/search");
        expect(url.searchParams.get("name")).toBe("Lyon");
        expect(url.searchParams.get("language")).toBe("fr");
        expect(await service.search("lyon")).toHaveLength(2);
        expect(fetchFn).toHaveBeenCalledOnce();
    });

    it("finds nothing for a single letter, an unknown town or a failing service", async () => {
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(geocoding())
            .mockRejectedValueOnce(new Error("offline"));
        const service = new PlaceSearchService(fetchFn);
        expect(await service.search("L")).toEqual([]);
        expect(await service.search("zzqqxx")).toEqual([]);
        expect(await service.search("Brest")).toEqual([]);
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});
