import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";
import type { Writable } from "svelte/store";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-11-14T11:22:12Z");

const cells = vi.hoisted((): { value: { at: number; weather?: string; temperature?: number }[] } => ({ value: [] }));
const forecastAsked = vi.hoisted((): { settings: unknown[]; dates: Date[] } => ({ settings: [], dates: [] }));
const wamSettings = vi.hoisted((): { value: unknown } => ({ value: {} }));
const clock = vi.hoisted((): { store: Writable<Date | undefined> | undefined } => ({ store: undefined }));

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        actionbar: {
            weatherBanner: {
                label: label("Map weather"),
                now: label("Now"),
                inHours: ({ hours }: { hours: number }) => `+${hours} h`,
                cell: ({ when, weather }: { when: string; weather: string }) => `${when}: ${weather}`,
                unknown: label("Unknown forecast"),
                close: label("Hide the weather"),
                attribution: label("Real weather: Open-Meteo"),
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

import WeatherForecastBanner from "../../../../src/front/Components/Weather/WeatherForecastBanner.svelte";
import { weatherBannerStore } from "../../../../src/front/Stores/WeatherBannerStore";

function nightDate(): Writable<Date | undefined> {
    if (!clock.store) throw new Error("NightStore not mocked");
    return clock.store;
}

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

function render(): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(WeatherForecastBanner, { target });
    flushSync();
}

function banner(): HTMLElement | null {
    return target.querySelector('[data-testid="weather-banner"]');
}

beforeEach(() => {
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
    it("shows the weather now, in one hour and in four hours, with the real temperature and its source", () => {
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
        const source = banner()?.querySelector("a");
        expect(source?.getAttribute("href")).toBe("https://open-meteo.com/");
        expect(source?.getAttribute("title")).toBe("Real weather: Open-Meteo");
    });

    it("has no temperature nor source for a weather that is not real", () => {
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
});
