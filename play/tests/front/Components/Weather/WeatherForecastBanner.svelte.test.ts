import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";
import type { Writable } from "svelte/store";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-14T11:22:12Z");

const cells = vi.hoisted(
    (): {
        value: {
            at: number;
            weather?: string;
            temperature?: number;
            cloudiness?: number;
            windSpeed?: number;
            windFrom?: number;
        }[];
    } => ({ value: [] }),
);
const forecastAsked = vi.hoisted((): { settings: unknown[]; dates: Date[] } => ({ settings: [], dates: [] }));
const wamSettings = vi.hoisted((): { value: unknown } => ({ value: {} }));
const place = vi.hoisted((): { value: { name: string } | undefined } => ({ value: undefined }));
const clock = vi.hoisted((): { store: Writable<Date | undefined> | undefined } => ({ store: undefined }));
const chosen = vi.hoisted(
    (): {
        place: { store: Writable<{ name: string; latitude: number; longitude: number } | undefined> | undefined };
        cells: { at: number; weather?: string; temperature?: number; windSpeed?: number; windFrom?: number }[];
    } => ({ place: { store: undefined }, cells: [] }),
);

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            weatherBanner: {
                label: label("Map weather"),
                now: label("Now"),
                humidity: ({ value }: { value: number }) => `${value} % humidity`,
                manual: label("manual"),
                inHours: ({ hours }: { hours: number }) => `+${hours} h`,
                cell: ({ when, weather }: { when: string; weather: string }) => `${when}: ${weather}`,
                cellWithWind: ({ when, weather, speed }: { when: string; weather: string; speed: number }) =>
                    `${when}: ${weather}, wind ${speed} km/h`,
                cellWithWindFrom: ({
                    when,
                    weather,
                    from,
                    speed,
                }: {
                    when: string;
                    weather: string;
                    from: string;
                    speed: number;
                }) => `${when}: ${weather}, wind from the ${from} at ${speed} km/h`,
                windSpeed: ({ speed }: { speed: number }) => `${speed} km/h`,
                windPoint: {
                    n: label("N"),
                    ne: label("NE"),
                    e: label("E"),
                    se: label("SE"),
                    s: label("S"),
                    sw: label("SW"),
                    w: label("W"),
                    nw: label("NW"),
                },
                windFrom: {
                    n: label("north"),
                    ne: label("north-east"),
                    e: label("east"),
                    se: label("south-east"),
                    s: label("south"),
                    sw: label("south-west"),
                    w: label("west"),
                    nw: label("north-west"),
                },
                unknown: label("Unknown forecast"),
                close: label("Hide the weather"),
                unfold: label("Show the full weather"),
                fold: label("Fold the weather"),
                server: label("Server weather"),
                local: label("Your weather"),
                defaultCity: label("Paris"),
            },
        },
        mapEditor: {
            settings: {
                weather: {
                    automatic: label("Auto"),
                    clear: label("Clear"),
                    rain: label("Rain"),
                    snow: label("Snow"),
                    storm: label("Storm"),
                    fog: label("Fog"),
                    real: label("Real"),
                    cloudy: label("Cloudy"),
                },
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings: wamSettings.value }) }) }),
        }),
    },
}));
vi.mock("../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    shownMapPlace: (settings: { weatherLocation?: unknown } | undefined) => place.value ?? settings?.weatherLocation,
    shownWeatherForecast: (settings: unknown, date: Date) => {
        forecastAsked.settings.push(settings);
        forecastAsked.dates.push(date);
        return cells.value;
    },
}));
vi.mock("../../../../src/front/Stores/NightStore", async () => {
    const { writable: makeWritable } = await import("svelte/store");
    const store = makeWritable<Date | undefined>(undefined);
    clock.store = store;
    return { nightDateStore: store };
});

vi.mock("../../../../src/front/Phaser/Game/Weather/ChosenPlaceWeather", async () => {
    const { readable: makeReadable, writable: makeWritable } = await import("svelte/store");
    const place = makeWritable<{ name: string; latitude: number; longitude: number } | undefined>(undefined);
    chosen.place.store = place;
    return {
        chosenPlaceStore: place,
        chosenWeatherStateStore: makeReadable({ place: undefined, state: { status: "pending" } }),
        chosenPlaceForecast: () => chosen.cells,
    };
});

import WeatherForecastBanner from "../../../../src/front/Components/Weather/WeatherForecastBanner.svelte";
import { fireConditionsStore } from "../../../../src/front/Stores/FireConditionsStore";
import { weatherBannerStore } from "../../../../src/front/Stores/WeatherBannerStore";

function nightDate(): Writable<Date | undefined> {
    if (!clock.store) throw new Error("NightStore not mocked");
    return clock.store;
}

const conditions = {
    manual: true,
    temperature: 38,
    humidity: 12,
    windSpeed: 55,
    windFrom: 180,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
};

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

/** Mounts the banner; opened, its full brief is shown as after a click on the chip. */
function render(opened = true): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(WeatherForecastBanner, { target });
    flushSync();
    if (opened) chip()?.click();
    flushSync();
}

function chip(): HTMLButtonElement | null {
    return target.querySelector<HTMLButtonElement>('[data-testid="weather-chip"]');
}

function banner(): HTMLElement | null {
    return target.querySelector('[data-testid="weather-banner"]');
}

beforeEach(() => {
    localStorage.removeItem("weatherCardsOpen");
    chosen.place.store?.set(undefined);
    chosen.cells = [];
    fireConditionsStore.set(undefined);
    place.value = undefined;
    weatherBannerStore.set(true);
    nightDate().set(NOW);
    wamSettings.value = { weather: "real" };
    forecastAsked.settings = [];
    forecastAsked.dates = [];
    cells.value = [
        { at: NOW.getTime(), weather: "rain", temperature: 8.2 },
        { at: NOW.getTime() + HOUR, weather: "storm", temperature: 9.6 },
        { at: NOW.getTime() + 4 * HOUR, weather: undefined, temperature: undefined },
    ];
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
});

describe("WeatherForecastBanner", () => {
    it("shows the weather now, in one hour and in four hours, with the real temperature and no link", () => {
        render();
        expect(forecastAsked.settings.at(-1)).toEqual({ weather: "real" });
        expect(forecastAsked.dates.at(-1)).toEqual(NOW);
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.getAttribute("aria-label"))).toEqual([
            "Now: Rain",
            "+1 h: Storm",
            "+4 h: Unknown forecast",
        ]);
        expect(shown.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())).toEqual([
            "Now 8°",
            "+1 h 10°",
            "+4 h ?",
        ]);
        // The source is credited in the map weather settings, not in the banner.
        expect(banner()?.querySelector("a")).toBeNull();
    });

    it("adds the humidity of the air the room goes by, for now only", () => {
        fireConditionsStore.set({ ...conditions, manual: false });
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown[0].textContent?.replace(/\s+/g, " ").trim()).toBe("Now 8° 12 % humidity");
        expect(shown[1].textContent).not.toContain("humidity");
        expect(target.querySelector('[data-testid="weather-banner-manual"]')).toBeNull();
    });

    it("shows the heat and the wind set by hand in the room, and says so", () => {
        fireConditionsStore.set(conditions);
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown[0].textContent?.replace(/\s+/g, " ").trim()).toContain("Now 38°");
        expect(shown[0].querySelector('[data-testid="weather-banner-wind"]')?.textContent).toContain("55");
        expect(shown[1].textContent?.replace(/\s+/g, " ").trim()).toBe("+1 h 10°");
        expect(target.querySelector('[data-testid="weather-banner-manual"]')?.textContent).toBe("manual");
    });

    it("has no temperature for a weather that is not real", () => {
        cells.value = cells.value.map((cell) => ({ ...cell, weather: "snow", temperature: undefined }));
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())).toEqual(["Now", "+1 h", "+4 h"]);
        expect(banner()?.querySelector("a")).toBeNull();
    });

    it("follows the game clock", () => {
        render();
        const later = new Date(NOW.getTime() + 15 * 60 * 1000);
        nightDate().set(later);
        flushSync();
        expect(forecastAsked.dates.at(-1)).toEqual(later);
    });

    it("is hidden until turned on, without the game clock, and once closed", () => {
        weatherBannerStore.set(false);
        render();
        expect(banner()).toBeNull();
        weatherBannerStore.set(true);
        nightDate().set(undefined);
        flushSync();
        expect(banner()).toBeNull();
        nightDate().set(NOW);
        flushSync();
        const close = banner()?.querySelector<HTMLButtonElement>('button[aria-label="Hide the weather"]');
        close?.click();
        flushSync();
        expect(banner()).toBeNull();
        expect(get(weatherBannerStore)).toBe(false);
        expect(localStorage.getItem("weatherBannerShown")).toBe("false");
    });

    it("names a clear sky with clouds Cloudy, with the sun behind a cloud or a cloud alone when overcast", () => {
        cells.value = [
            { at: NOW.getTime(), weather: "clear", cloudiness: 0.5 },
            { at: NOW.getTime() + HOUR, weather: "clear", cloudiness: 0.9 },
            { at: NOW.getTime() + 4 * HOUR, weather: "clear" },
        ];
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.getAttribute("aria-label"))).toEqual([
            "Now: Cloudy",
            "+1 h: Cloudy",
            "+4 h: Clear",
        ]);
        expect(shown.map((cell) => cell.querySelector("svg")?.getAttribute("data-testid"))).toEqual([
            "weather-icon-automatic",
            "weather-icon-cloudy",
            "weather-icon-clear",
        ]);
    });

    it("names the town of the map first, Paris without one", () => {
        wamSettings.value = {
            weather: "real",
            weatherLocation: { name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.75, longitude: 4.85 },
        };
        render();
        expect(target.querySelector('[data-testid="weather-card-server-city"]')?.textContent?.trim()).toBe("Lyon");
    });

    it("names Paris for a map without a place", () => {
        wamSettings.value = { weather: "automatic" };
        render();
        expect(target.querySelector('[data-testid="weather-card-server-city"]')?.textContent?.trim()).toBe("Paris");
    });

    it("follows a town tried in the panel at the next tick, the map settings being the same object", () => {
        render();
        expect(target.querySelector('[data-testid="weather-card-server-city"]')?.textContent?.trim()).toBe("Paris");
        place.value = { name: "Perpignan, Occitanie, France" };
        nightDate().set(new Date(NOW.getTime() + 1000));
        flushSync();
        expect(target.querySelector('[data-testid="weather-card-server-city"]')?.textContent?.trim()).toBe("Perpignan");
    });

    it("calls a clear sky with a few clouds clear, from 0.2 cloudy", () => {
        cells.value = [
            { at: NOW.getTime(), weather: "clear", cloudiness: 0.1 },
            { at: NOW.getTime() + HOUR, weather: "clear", cloudiness: 0.2 },
            { at: NOW.getTime() + 4 * HOUR, weather: "rain", cloudiness: 1 },
        ];
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.getAttribute("aria-label"))).toEqual([
            "Now: Clear",
            "+1 h: Cloudy",
            "+4 h: Rain",
        ]);
    });
    it("shows the wind speed for now only, and nothing when the wind is unknown", () => {
        cells.value = [
            { at: NOW.getTime(), weather: "rain", temperature: 8.2, windSpeed: 23 },
            { at: NOW.getTime() + HOUR, weather: "storm", temperature: 9.6, windSpeed: 41 },
            { at: NOW.getTime() + 4 * HOUR, weather: "rain" },
        ];
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.getAttribute("aria-label"))).toEqual([
            "Now: Rain, wind 23 km/h",
            "+1 h: Storm",
            "+4 h: Rain",
        ]);
        expect(shown.map((cell) => cell.querySelector('[data-testid="weather-banner-wind"]')?.textContent)).toEqual([
            "23 km/h",
            undefined,
            undefined,
        ]);
        expect(shown[0].querySelector('[data-testid="weather-banner-wind-icon"]')).not.toBeNull();

        cells.value = cells.value.map((cell) => ({ at: cell.at, weather: cell.weather }));
        nightDate().set(new Date(NOW.getTime() + 1000));
        flushSync();
        expect(target.querySelector('[data-testid="weather-banner-wind"]')).toBeNull();
        expect(target.querySelector('[data-testid="weather-banner-wind-icon"]')).toBeNull();
    });
    it("shows where the wind comes from with an arrow pointing where it goes, for now only", () => {
        cells.value = [
            { at: NOW.getTime(), weather: "cloudy", temperature: 16, windSpeed: 22, windFrom: 315 },
            { at: NOW.getTime() + HOUR, weather: "rain", temperature: 16, windSpeed: 20, windFrom: 90 },
            { at: NOW.getTime() + 4 * HOUR, weather: "rain" },
        ];
        render();
        const shown = [...target.querySelectorAll('[data-testid="weather-banner-cell"]')];
        expect(shown.map((cell) => cell.getAttribute("aria-label"))).toEqual([
            "Now: Cloudy, wind from the north-west at 22 km/h",
            "+1 h: Rain",
            "+4 h: Rain",
        ]);
        expect(shown.map((cell) => cell.querySelector('[data-testid="weather-banner-wind"]')?.textContent)).toEqual([
            "NW 22 km/h",
            undefined,
            undefined,
        ]);
        // A north-west wind goes south-east: the diagonal arrow (north-east) turned a quarter turn clockwise.
        const arrow = shown[0].querySelector<SVGElement>('[data-testid="weather-banner-wind-arrow"]');
        expect(arrow?.getAttribute("data-towards")).toBe("135");
        expect(arrow?.style.transform).toBe("rotate(90deg)");
        // The arrow takes the place of the gusts.
        expect(shown[0].querySelector('[data-testid="weather-banner-wind-icon"]')).toBeNull();
        expect(target.querySelectorAll('[data-testid="weather-banner-wind-arrow"]')).toHaveLength(1);
    });
    it("shows no direction without a wind speed, and the gusts when only the direction is unknown", () => {
        cells.value = [{ at: NOW.getTime(), weather: "rain", windFrom: 315 }];
        render();
        expect(target.querySelector('[data-testid="weather-banner-cell"]')?.getAttribute("aria-label")).toBe(
            "Now: Rain",
        );
        expect(target.querySelector('[data-testid="weather-banner-wind-arrow"]')).toBeNull();
        expect(target.querySelector('[data-testid="weather-banner-wind"]')).toBeNull();

        cells.value = [{ at: NOW.getTime(), weather: "rain", windSpeed: 23 }];
        nightDate().set(new Date(NOW.getTime() + 1000));
        flushSync();
        expect(target.querySelector('[data-testid="weather-banner-wind"]')?.textContent).toBe("23 km/h");
        expect(target.querySelector('[data-testid="weather-banner-wind-icon"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="weather-banner-wind-arrow"]')).toBeNull();
    });

    it("shows only the town, the weather of now and the wind at a glance, the full brief on a click", () => {
        cells.value = [{ at: NOW.getTime(), weather: "rain", temperature: 8.2, windSpeed: 20, windFrom: 270 }];
        place.value = { name: "Los Angeles, California, USA" };
        render(false);
        expect(target.querySelector('[data-testid="weather-chip-server"]')?.textContent?.trim()).toBe("Los Angeles");
        // A wind from the west blows to the east: the arrow points there.
        expect(target.querySelector('[data-testid="weather-chip-server-wind"]')?.getAttribute("data-towards")).toBe(
            "90",
        );
        expect(target.querySelector('[data-testid="weather-banner-cell"]')).toBeNull();
        expect(chip()?.getAttribute("aria-expanded")).toBe("false");
        chip()?.click();
        flushSync();
        expect(target.querySelectorAll('[data-testid="weather-banner-cell"]')).toHaveLength(1);
        expect(localStorage.getItem("weatherCardsOpen")).toBe("true");
    });

    it("shows the weather of the server with a globe and this player's own with a computer", () => {
        chosen.cells = [{ at: NOW.getTime(), weather: "snow", temperature: -3 }];
        render(false);
        expect(target.querySelector('[data-testid="weather-chip-local"]')).toBeNull();
        chosen.place.store?.set({ name: "Lille, Hauts-de-France, France", latitude: 50.6, longitude: 3.1 });
        flushSync();
        expect(target.querySelector('[data-testid="weather-chip-local"]')?.textContent?.trim()).toBe("Lille");
        chip()?.click();
        flushSync();
        const server = target.querySelector('[data-testid="weather-card-server-kind"]');
        const local = target.querySelector('[data-testid="weather-card-local-kind"]');
        expect(server?.getAttribute("data-kind")).toBe("server");
        expect(server?.getAttribute("aria-label")).toBe("Server weather");
        expect(local?.getAttribute("data-kind")).toBe("local");
        expect(target.querySelector('[data-testid="weather-card-local-city"]')?.textContent).toBe("Lille");
        expect(
            target
                .querySelector('[data-testid="weather-card-local"]')
                ?.querySelector('[data-testid="weather-banner-cell"]')
                ?.textContent?.replace(/\s+/g, " ")
                .trim(),
        ).toBe("Now -3°");
    });

    it("shows no badge while the player follows the server: there is one weather only", () => {
        render();
        expect(target.querySelector('[data-testid="weather-card-server-kind"]')).toBeNull();
        expect(target.querySelector('[data-testid="weather-card-local"]')).toBeNull();
    });
});
