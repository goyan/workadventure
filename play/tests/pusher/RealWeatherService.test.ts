import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearchService, RealWeatherService } from "../../src/pusher/services/RealWeatherService";

/** Shape of a real Open-Meteo answer for Paris (2026-11-14). */
function openMeteo(code: number): Response {
    return new Response(
        JSON.stringify({
            latitude: 48.853382,
            longitude: 2.355208,
            timezone: "Europe/Paris",
            current_units: { time: "iso8601", interval: "seconds", weather_code: "wmo code" },
            current: { time: "2026-11-14T10:15", interval: 900, weather_code: code },
        }),
    );
}

const MINUTE = 60_000;

function urlOf(input: string | URL | Request): URL {
    return input instanceof Request ? new URL(input.url) : new URL(input);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("RealWeatherService", () => {
    it("asks Open-Meteo for the current weather code in Paris, once for simultaneous colleagues", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(openMeteo(45));
        const service = new RealWeatherService(fetchFn, () => 1_000);
        const [first, second] = await Promise.all([service.get(), service.get()]);
        expect(first).toEqual({ weather: "fog", since: 1_000 });
        expect(second).toEqual(first);
        expect(fetchFn).toHaveBeenCalledOnce();
        const input = fetchFn.mock.calls[0][0];
        const url = input instanceof Request ? new URL(input.url) : new URL(input);
        expect(url.origin).toBe("https://api.open-meteo.com");
        expect(url.searchParams.get("current")).toBe("weather_code");
        expect(Number(url.searchParams.get("latitude"))).toBeCloseTo(48.8566);
        expect(Number(url.searchParams.get("longitude"))).toBeCloseTo(2.3522);
    });

    it("keeps its answer ten minutes, then asks again and keeps the start of an unchanged weather", async () => {
        let now = 0;
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(openMeteo(61))
            .mockResolvedValueOnce(openMeteo(63))
            .mockResolvedValueOnce(openMeteo(0));
        const service = new RealWeatherService(fetchFn, () => now);
        expect(await service.get()).toEqual({ weather: "rain", since: 0 });
        now = 9 * MINUTE;
        expect(await service.get()).toEqual({ weather: "rain", since: 0 });
        expect(fetchFn).toHaveBeenCalledOnce();
        now = 10 * MINUTE;
        expect(await service.get()).toEqual({ weather: "rain", since: 0 });
        now = 20 * MINUTE;
        expect(await service.get()).toEqual({ weather: "clear", since: 20 * MINUTE });
        expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("keeps the last weather through a failure, and gives none once it is an hour old", async () => {
        let now = 0;
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(openMeteo(71))
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(new Response("busy", { status: 503 }))
            .mockResolvedValue(new Response(JSON.stringify({ current: { weather_code: "fog" } })));
        const service = new RealWeatherService(fetchFn, () => now);
        expect(await service.get()).toEqual({ weather: "snow", since: 0 });
        now = 10 * MINUTE;
        expect(await service.get()).toEqual({ weather: "snow", since: 0 });
        now = 20 * MINUTE;
        expect(await service.get()).toEqual({ weather: "snow", since: 0 });
        // A failed attempt is not retried at once: one call per ten minutes at most.
        expect(await service.get()).toEqual({ weather: "snow", since: 0 });
        expect(fetchFn).toHaveBeenCalledTimes(3);
        now = 60 * MINUTE + 1;
        expect(await service.get()).toEqual({ weather: null, since: null });
    });

    it("gives no weather for a code it does not know", async () => {
        const service = new RealWeatherService(vi.fn<typeof fetch>().mockResolvedValue(openMeteo(42)), () => 0);
        expect(await service.get()).toEqual({ weather: null, since: null });
    });
});

describe("RealWeatherService, place of the map", () => {
    it("asks for the given place, and keeps one answer per place (to about a kilometre)", async () => {
        const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
            const url = new URL(input instanceof Request ? input.url : input);
            return Promise.resolve(openMeteo(url.searchParams.get("latitude") === "45.75" ? 61 : 0));
        });
        const service = new RealWeatherService(fetchFn, () => 0);
        expect(await service.get({ latitude: 45.74906, longitude: 4.84789 })).toEqual({ weather: "rain", since: 0 });
        expect(await service.get({ latitude: 45.7501, longitude: 4.8502 })).toEqual({ weather: "rain", since: 0 });
        expect(await service.get()).toEqual({ weather: "clear", since: 0 });
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
