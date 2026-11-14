import { afterEach, describe, expect, it, vi } from "vitest";
import { RealWeatherService } from "../../src/pusher/services/RealWeatherService";

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
