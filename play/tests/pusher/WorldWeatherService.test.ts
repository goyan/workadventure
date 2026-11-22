import { describe, expect, it, vi } from "vitest";
import { WorldWeatherService } from "../../src/pusher/services/WorldWeatherService";
import { WORLD_WEATHER_PLACES } from "../../src/common/WorldWeather";

const MINUTE = 60_000;

/** An answer of Open-Meteo for every place of the list, all dry. */
function answer(): Response {
    const body = WORLD_WEATHER_PLACES.map(() => ({
        current: {
            time: 1795342500,
            interval: 900,
            weather_code: 0,
            temperature_2m: 10,
            relative_humidity_2m: 50,
            precipitation: 0,
            is_day: 1,
        },
    }));
    return new Response(JSON.stringify(body), { status: 200 });
}

describe("WorldWeatherService", () => {
    it("asks Open-Meteo once for all the places, and answers again from it for ten minutes", async () => {
        let now = 0;
        const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(answer()));
        const service = new WorldWeatherService(fetchFn, () => now);
        const first = await service.get();
        expect(first?.places).toHaveLength(WORLD_WEATHER_PLACES.length);
        now = 9 * MINUTE;
        await service.get();
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const url = fetchFn.mock.calls[0]?.[0];
        if (!(url instanceof URL)) throw new Error("no URL asked");
        expect(url.searchParams.get("latitude")?.split(",")).toHaveLength(WORLD_WEATHER_PLACES.length);
        now = 11 * MINUTE;
        await service.get();
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("shares one request between players asking at the same time", async () => {
        const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(answer()));
        const service = new WorldWeatherService(fetchFn, () => 0);
        await Promise.all([service.get(), service.get(), service.get()]);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("answers nothing when Open-Meteo fails, and tries again only a minute later", async () => {
        let now = 0;
        const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response("busy", { status: 429 })));
        const service = new WorldWeatherService(
            fetchFn,
            () => now,
            () => undefined,
        );
        expect(await service.get()).toBeUndefined();
        now = 30_000;
        expect(await service.get()).toBeUndefined();
        expect(fetchFn).toHaveBeenCalledTimes(1);
        now = 61_000;
        fetchFn.mockResolvedValueOnce(answer());
        expect((await service.get())?.places).toHaveLength(WORLD_WEATHER_PLACES.length);
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("keeps the last weather known through a failure", async () => {
        let now = 0;
        const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(answer()));
        const service = new WorldWeatherService(
            fetchFn,
            () => now,
            () => undefined,
        );
        await service.get();
        now = 11 * MINUTE;
        fetchFn.mockResolvedValueOnce(new Response("busy", { status: 500 }));
        expect((await service.get())?.places).toHaveLength(WORLD_WEATHER_PLACES.length);
    });
});
