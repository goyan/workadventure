import { WeatherType } from "@workadventure/map-editor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../../../../../src/front/Phaser/Game/Weather/RealWeatherClient";

vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getAuthToken: () => "token" },
}));
vi.mock("../../../../../src/front/Enum/ComputedConst", () => ({ ABSOLUTE_PUSHER_URL: "http://pusher.test/" }));
vi.mock("../../../../../src/front/Stores/NightStore", async () => {
    const { writable } = await import("svelte/store");
    return { nightDateStore: writable<Date | undefined>(undefined) };
});

const MINUTE = 60_000;
const SLOT = 15 * MINUTE;
const START = Date.UTC(2026, 10, 14, 11, 0);
const lyon = { name: "Lyon, France", latitude: 45.75, longitude: 4.85 };
const brest = { name: "Brest, France", latitude: 48.39, longitude: -4.49 };

let client: typeof ClientModule;
const fetchMock = vi.fn<typeof fetch>();

/** A timeline of one weather from an hour before START to six hours after it. */
function timeline(weather: WeatherType): Response {
    const slots = Array.from({ length: 28 }, (_, index) => ({
        at: START - 4 * SLOT + index * SLOT,
        weather,
        temperature: 5,
    }));
    return new Response(JSON.stringify({ slots }));
}

function asked(): URL[] {
    return fetchMock.mock.calls.map(([input]) => new URL(input instanceof Request ? input.url : input));
}

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(START);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    client = await import("../../../../../src/front/Phaser/Game/Weather/RealWeatherClient");
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const at = (offset = 0) => new Date(START + offset);
const real = (place = lyon) => ({ weather: WeatherType.Real, weatherLocation: place });

describe("RealWeatherClient", () => {
    it("asks the pusher for the timeline of the place of the map, clear until it answers", async () => {
        fetchMock.mockResolvedValue(timeline(WeatherType.Rain));
        expect(client.shownWeatherSettings(real(), at())?.weather).toBe(WeatherType.Clear);
        await vi.advanceTimersByTimeAsync(0);
        expect(asked()[0].searchParams.get("latitude")).toBe("45.75");
        expect(asked()[0].searchParams.get("longitude")).toBe("4.85");
        expect(client.shownWeatherSettings(real(), at(1000))?.weather).toBe(WeatherType.Rain);
    });

    it("asks again every five minutes while a map shows it, and stops five minutes after the last one", async () => {
        fetchMock.mockImplementation(() => Promise.resolve(timeline(WeatherType.Rain)));
        client.shownWeatherSettings(real(), at());
        for (let minute = 1; minute <= 10; minute++) {
            // eslint-disable-next-line no-await-in-loop -- minute after minute, in order
            await vi.advanceTimersByTimeAsync(MINUTE);
            client.shownWeatherSettings(real(), at(minute * MINUTE));
        }
        expect(fetchMock).toHaveBeenCalledTimes(3);
        // No map in Real any more: one last poll may run, then none.
        await vi.advanceTimersByTimeAsync(30 * MINUTE);
        expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
        const calls = fetchMock.mock.calls.length;
        await vi.advanceTimersByTimeAsync(30 * MINUTE);
        expect(fetchMock).toHaveBeenCalledTimes(calls);
        // Back on a map in Real: asked again at once.
        client.shownWeatherSettings(real(), at(70 * MINUTE));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
    });

    it("keeps the weather shown while a new place is asked, and falls back to Auto if it cannot be had", async () => {
        fetchMock.mockResolvedValueOnce(timeline(WeatherType.Rain)).mockRejectedValueOnce(new Error("offline"));
        client.shownWeatherSettings(real(), at());
        await vi.advanceTimersByTimeAsync(0);
        expect(client.shownWeatherSettings(real(brest), at(1000))?.weather).toBe(WeatherType.Rain);
        await vi.advanceTimersByTimeAsync(0);
        expect(asked()[1].searchParams.get("latitude")).toBe("48.39");
        expect(client.shownWeatherSettings(real(brest), at(2000))?.weather).toBe(WeatherType.Automatic);
    });

    it("keeps its timeline through a failed poll, and falls back to Auto on a first failure", async () => {
        fetchMock.mockResolvedValueOnce(timeline(WeatherType.Snow)).mockRejectedValue(new Error("offline"));
        client.shownWeatherSettings(real(), at());
        await vi.advanceTimersByTimeAsync(0);
        client.shownWeatherSettings(real(), at(5 * MINUTE));
        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(client.shownWeatherSettings(real(), at(5 * MINUTE))?.weather).toBe(WeatherType.Snow);
        // A new place whose first answer fails.
        expect(client.shownWeatherSettings(real(brest), at(6 * MINUTE))?.weather).toBe(WeatherType.Snow);
        await vi.advanceTimersByTimeAsync(0);
        expect(client.shownWeatherSettings(real(brest), at(6 * MINUTE))?.weather).toBe(WeatherType.Automatic);
    });

    it("the banner reads what is known without asking, blank for a place not followed yet", async () => {
        fetchMock.mockResolvedValue(timeline(WeatherType.Fog));
        expect(client.shownWeatherForecast(real(), at()).map((cell) => cell.weather)).toEqual([
            undefined,
            undefined,
            undefined,
        ]);
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).not.toHaveBeenCalled();
        client.shownWeatherSettings(real(), at());
        await vi.advanceTimersByTimeAsync(0);
        expect(client.shownWeatherForecast(real(), at()).map((cell) => cell.weather)).toEqual([
            WeatherType.Fog,
            WeatherType.Fog,
            WeatherType.Fog,
        ]);
    });

    it("shows the weather being tried, until the panel closes", () => {
        client.weatherPreviewStore.set({ weather: WeatherType.Storm });
        expect(client.shownWeatherSettings({ weather: WeatherType.Clear }, at())?.weather).toBe(WeatherType.Storm);
        client.weatherPreviewStore.set(undefined);
        expect(client.shownWeatherSettings({ weather: WeatherType.Clear }, at())?.weather).toBe(WeatherType.Clear);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
