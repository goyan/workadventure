import { describe, expect, it, vi } from "vitest";
import { WeatherType } from "@workadventure/map-editor";
import {
    WorldFall,
    WorldWeatherClient,
    fallOf,
    fallingPlaces,
    nextFallPlace,
    pickWorldFall,
    stillFalls,
} from "@wa/front/Phaser/Game/Night/WorldWeatherPick";
import type { WorldPlaceWeather, WorldWeatherReport } from "@wa/common/WorldWeather";
import { REAL_WEATHER_SLOT_MS } from "@wa/common/RealWeather";
import type { RealWeatherSlot } from "@wa/common/RealWeather";

const weather = (name: string, values: Partial<WorldPlaceWeather> = {}): WorldPlaceWeather => ({
    name,
    weatherCode: 0,
    temperature: 10,
    humidity: 70,
    rainRate: 0,
    isDay: true,
    ...values,
});
const raining = (name: string, rainRate: number, isDay = true): WorldPlaceWeather =>
    weather(name, { weatherCode: 61, temperature: 12, humidity: 90, rainRate, isDay });
const snowing = (name: string, rainRate: number, isDay = true): WorldPlaceWeather =>
    weather(name, { weatherCode: 73, temperature: -3, humidity: 85, rainRate, isDay });
const report = (...places: WorldPlaceWeather[]): WorldWeatherReport => ({ at: 0, places });

describe("fallOf", () => {
    it("says rain or snow by the air the precipitation falls through, as the game draws it", () => {
        expect(fallOf(raining("Paris", 2))).toBe(WorldFall.Rain);
        expect(fallOf(snowing("Moscou", 0.4))).toBe(WorldFall.Snow);
        // A snow code in a mild air: the game draws rain there, so it is rain.
        expect(fallOf(weather("Rome", { weatherCode: 71, temperature: 9, humidity: 80 }))).toBe(WorldFall.Rain);
        // A rain code in a freezing air: flakes in the game, so it is snow.
        expect(fallOf(weather("Anadyr", { weatherCode: 61, temperature: -4, humidity: 90 }))).toBe(WorldFall.Snow);
        // A storm falls too.
        expect(fallOf(weather("Bangkok", { weatherCode: 95, temperature: 28, humidity: 90 }))).toBe(WorldFall.Rain);
    });

    it("counts sleet by what falls most: rain under half of snow, snow from half", () => {
        // 2.5 °C at 85 %: a wet bulb of 1.1 °C, 38 % of snow, drawn mostly as drops.
        expect(fallOf(weather("A", { weatherCode: 66, temperature: 2.5, humidity: 85 }))).toBe(WorldFall.Rain);
        // 2.2 °C at 85 %: a wet bulb of 0.8 °C, 67 % of snow, drawn mostly as flakes.
        expect(fallOf(weather("B", { weatherCode: 66, temperature: 2.2, humidity: 85 }))).toBe(WorldFall.Snow);
    });

    it("finds nothing falling under a dry sky, a fog or an unknown weather, even with a little water counted", () => {
        expect(fallOf(weather("Dubaï", { weatherCode: 0 }))).toBeUndefined();
        expect(fallOf(weather("Lima", { weatherCode: 3, rainRate: 0.4 }))).toBeUndefined();
        expect(fallOf(weather("Londres", { weatherCode: 45 }))).toBeUndefined();
        expect(fallOf(weather("X", { weatherCode: null, rainRate: 3 }))).toBeUndefined();
    });

    it("takes a fall without its temperature for rain, as the game does", () => {
        expect(fallOf(weather("Praia", { weatherCode: 61, temperature: null }))).toBe(WorldFall.Rain);
    });
});

describe("fallingPlaces", () => {
    it("lists the places where it rains, by day first, then the strongest, then by name", () => {
        const places = fallingPlaces(
            report(
                raining("Bombay", 6, false),
                raining("Paris", 0.4),
                snowing("Moscou", 1),
                raining("Rio de Janeiro", 3.2),
                weather("Dakar"),
                raining("Lisbonne", 3.2),
            ),
            WorldFall.Rain,
        );
        expect(places.map((place) => place.city.name)).toEqual(["Lisbonne", "Rio de Janeiro", "Paris", "Bombay"]);
        expect(places[0]).toMatchObject({ fall: WorldFall.Rain, rainRate: 3.2, isDay: true });
        expect(places[0]?.city).toMatchObject({ name: "Lisbonne", timezone: "Europe/Lisbon" });
    });

    it("lists the places where it snows apart from those where it rains", () => {
        const places = fallingPlaces(report(raining("Paris", 2), snowing("Moscou", 1)), WorldFall.Snow);
        expect(places.map((place) => place.city.name)).toEqual(["Moscou"]);
    });

    it("leaves out a name that is not a place of the list", () => {
        expect(fallingPlaces(report(raining("Atlantis", 9)), WorldFall.Rain)).toEqual([]);
    });
});

describe("nextFallPlace", () => {
    const places = fallingPlaces(
        report(raining("Lisbonne", 3), raining("Paris", 2), raining("Tokyo", 1)),
        WorldFall.Rain,
    );

    it("takes the first place, then the one after the place shown, round the list", () => {
        expect(nextFallPlace(places, undefined)?.city.name).toBe("Lisbonne");
        expect(nextFallPlace(places, "Lisbonne")?.city.name).toBe("Paris");
        expect(nextFallPlace(places, "Paris")?.city.name).toBe("Tokyo");
        expect(nextFallPlace(places, "Tokyo")?.city.name).toBe("Lisbonne");
        // The place shown no longer has rain: the first again.
        expect(nextFallPlace(places, "Moscou")?.city.name).toBe("Lisbonne");
    });

    it("has nothing to take from an empty list", () => {
        expect(nextFallPlace([], "Paris")).toBeUndefined();
    });
});

describe("WorldWeatherClient", () => {
    it("asks the pusher once within five minutes, and once for clicks made while it answers", async () => {
        let now = 0;
        const fetcher = vi.fn(() => Promise.resolve(report(raining("Paris", 2))));
        const client = new WorldWeatherClient(fetcher, () => now);
        await Promise.all([client.get(), client.get()]);
        now = 4 * 60_000;
        await client.get();
        expect(fetcher).toHaveBeenCalledTimes(1);
        now = 6 * 60_000;
        await client.get();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("keeps no failure: the next click asks again", async () => {
        const fetcher = vi.fn(() => Promise.reject(new Error("HTTP 502")));
        const client = new WorldWeatherClient(fetcher, () => 0);
        await expect(client.get()).rejects.toThrow("HTTP 502");
        await expect(client.get()).rejects.toThrow("HTTP 502");
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});

describe("pickWorldFall", () => {
    it("picks a place where it falls, the next one at the next click", async () => {
        const client = new WorldWeatherClient(
            () => Promise.resolve(report(raining("Lisbonne", 3), raining("Paris", 2), snowing("Moscou", 1))),
            () => 0,
        );
        const first = await pickWorldFall(WorldFall.Rain, client, undefined);
        expect(first).toMatchObject({ status: "picked", place: { city: { name: "Lisbonne" }, rainRate: 3 } });
        const second = await pickWorldFall(WorldFall.Rain, client, "Lisbonne");
        expect(second).toMatchObject({ status: "picked", place: { city: { name: "Paris" } } });
        expect(await pickWorldFall(WorldFall.Snow, client, "Paris")).toMatchObject({
            status: "picked",
            place: { city: { name: "Moscou" }, fall: WorldFall.Snow },
        });
    });

    it("says when it falls nowhere, and when the weather could not be read", async () => {
        const dry = new WorldWeatherClient(
            () => Promise.resolve(report(weather("Paris"))),
            () => 0,
        );
        expect(await pickWorldFall(WorldFall.Snow, dry, undefined)).toEqual({ status: "none" });
        const failing = new WorldWeatherClient(
            () => Promise.reject(new Error("offline")),
            () => 0,
        );
        expect(await pickWorldFall(WorldFall.Rain, failing, undefined)).toEqual({ status: "failed" });
    });
});

describe("stillFalls", () => {
    const slot = (at: number, weatherType: RealWeatherSlot["weather"], temperature: number): RealWeatherSlot => ({
        at,
        weather: weatherType,
        temperature,
        humidity: 85,
    });

    it("tells whether what was picked still falls at the place, from its timeline", () => {
        const slots = [slot(0, WeatherType.Rain, 10), slot(REAL_WEATHER_SLOT_MS, WeatherType.Clear, 10)];
        expect(stillFalls(WorldFall.Rain, slots, 60_000)).toBe(true);
        expect(stillFalls(WorldFall.Rain, slots, REAL_WEATHER_SLOT_MS + 60_000)).toBe(false);
        expect(stillFalls(WorldFall.Snow, slots, 60_000)).toBe(false);
        expect(stillFalls(WorldFall.Snow, [slot(0, WeatherType.Rain, -3)], 60_000)).toBe(true);
    });

    it("does not say before it knows", () => {
        expect(stillFalls(WorldFall.Rain, [], 60_000)).toBeUndefined();
    });
});
