import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable } from "svelte/store";

const executeUpdateWAMSettings = vi.hoisted(() => vi.fn());
const wamSettings = vi.hoisted(() => ({ value: {} }));
const realWeather = vi.hoisted((): { value: { status: string; weather?: string } } => ({
    value: { status: "pending" },
}));

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        menu: { settings: { save: label("Save") } },
        mapEditor: {
            settings: {
                weather: {
                    title: label("Weather"),
                    automatic: label("Auto"),
                    clear: label("Clear"),
                    rain: label("Rain"),
                    snow: label("Snow"),
                    storm: label("Storm"),
                    fog: label("Fog"),
                    real: label("Real"),
                    saving: label("Saving"),
                    success: label("Saved"),
                    error: label("Error"),
                    auto: {
                        frequency: label("Frequency"),
                        calm: label("Calm"),
                        normal: label("Normal"),
                        stormy: label("Stormy"),
                        include: label("Possible weather"),
                        stormHint: label("storm hint"),
                        snowHint: label("snow hint"),
                        fogHint: label("fog hint"),
                        now: ({ season, weather, time }: { season: string; weather: string; time: string }) =>
                            `${season} | Now: ${weather} until ${time}`,
                        then: ({ weather, time }: { weather: string; time: string }) => `then ${weather} at ${time}`,
                    },
                    season: {
                        winter: label("Winter"),
                        spring: label("Spring"),
                        summer: label("Summer"),
                        autumn: label("Autumn"),
                    },
                    fixed: { snowHint: label("fixed snow hint"), fogHint: label("fixed fog hint") },
                    previewHint: label("preview hint"),
                    location: {
                        title: label("Place"),
                        default: label("Paris (default)"),
                        search: label("Search"),
                        searching: label("Searching"),
                        noResult: label("No town"),
                        error: label("Search error"),
                        hint: label("place hint"),
                    },
                    realMode: {
                        hint: label("real hint"),
                        now: ({ weather }: { weather: string }) => `Paris now: ${weather}`,
                        pending: label("real pending"),
                        unavailable: label("real unavailable"),
                        attribution: label("Open-Meteo"),
                    },
                },
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            connection: {},
            getMapEditorModeManager: () => ({}),
            getServerDate: () => new Date(),
            getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings: wamSettings.value }) }) }),
        }),
    },
}));
const tried = vi.hoisted((): { value: unknown } => ({ value: undefined }));
const searchPlaces = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({
    realWeatherStore: readable<unknown>(undefined, (set) => set(realWeather.value)),
    weatherPreviewStore: { set: (value: unknown) => (tried.value = value) },
    searchPlaces,
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));
vi.mock("../../../../src/front/Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    return { mapEditorActivated: writable(true) };
});

import WeatherSettings from "../../../../src/front/Components/Menu/WeatherSettings.svelte";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLElement;

function render(): void {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = mount(WeatherSettings, { target });
    flushSync();
}

function tile(name: string): HTMLButtonElement {
    const found = [
        ...target.querySelectorAll<HTMLButtonElement>('[data-testid="map-weather-type"] [role="radio"]'),
    ].find((b) => b.textContent?.trim() === name);
    if (!found) throw new Error(`no tile ${name}`);
    return found;
}

function frequency(name: string): HTMLButtonElement {
    const found = [
        ...target.querySelectorAll<HTMLButtonElement>('[data-testid="map-weather-frequency"] [role="radio"]'),
    ].find((b) => b.textContent?.trim() === name);
    if (!found) throw new Error(`no frequency ${name}`);
    return found;
}

function saveButton(): HTMLButtonElement {
    const found = target.querySelector<HTMLButtonElement>('[data-testid="save-map-weather"]');
    if (!found) throw new Error("no save button");
    return found;
}

function preview(): string {
    return target.querySelector('[data-testid="map-weather-preview"]')?.textContent ?? "";
}

function checkbox(testId: string): HTMLInputElement {
    const input = target.querySelector<HTMLInputElement>(`[data-testid="${testId}"] input`);
    if (!input) throw new Error(`no checkbox ${testId}`);
    return input;
}

function click(element: HTMLElement): void {
    element.click();
    flushSync();
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    executeUpdateWAMSettings.mockReset();
    executeUpdateWAMSettings.mockResolvedValue(undefined);
    wamSettings.value = {};
    realWeather.value = { status: "pending" };
    tried.value = undefined;
    searchPlaces.mockReset();
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    vi.useRealTimers();
});

describe("WeatherSettings", () => {
    it("shows seven weather tiles and selects the map weather", () => {
        wamSettings.value = { weather: "rain" };
        render();
        const tiles = target.querySelectorAll('[data-testid="map-weather-type"] [role="radio"]');
        expect(tiles).toHaveLength(7);
        expect(tile("Rain").getAttribute("aria-checked")).toBe("true");
        expect(tile("Clear").getAttribute("aria-checked")).toBe("false");
        click(tile("Snow"));
        expect(tile("Snow").getAttribute("aria-checked")).toBe("true");
        expect(tile("Rain").getAttribute("aria-checked")).toBe("false");
    });

    it("shows the auto settings only for Auto", () => {
        wamSettings.value = { weather: "automatic" };
        render();
        expect(target.querySelector('[data-testid="map-weather-frequency"]')).not.toBeNull();
        expect(target.querySelectorAll('[data-testid^="map-weather-include-"]')).toHaveLength(4);
        click(tile("Clear"));
        expect(target.querySelector('[data-testid="map-weather-frequency"]')).toBeNull();
        expect(target.querySelectorAll('[data-testid^="map-weather-include-"]')).toHaveLength(0);
    });

    it("previews the next changes and updates them when the frequency changes", () => {
        wamSettings.value = { weather: "automatic" };
        render();
        const normal = preview();
        expect(normal).toContain("Summer");
        expect(normal).toContain("Now:");
        click(frequency("Calm"));
        const calm = preview();
        click(frequency("Stormy"));
        const stormy = preview();
        expect(new Set([normal, calm, stormy]).size).toBeGreaterThan(1);
        expect(calm).not.toBe(stormy);
    });

    it("sends the weather with the auto settings when saved", async () => {
        wamSettings.value = { weather: "clear" };
        render();
        click(tile("Auto"));
        click(checkbox("map-weather-include-storm"));
        click(frequency("Calm"));
        click(saveButton());
        await vi.waitFor(() => expect(executeUpdateWAMSettings).toHaveBeenCalledTimes(1));
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateWeatherSettingMessage",
            updateWeatherSettingMessage: {
                weather: "automatic",
                autoFrequency: "calm",
                autoInclude: ["rain", "snow", "fog"],
            },
        });
    });
});

describe("WeatherSettings, real weather", () => {
    function realPanel(): string {
        return target.querySelector('[data-testid="map-weather-real"]')?.textContent?.trim() ?? "";
    }

    it("shows the weather now in Paris, credits its source and saves the real mode", async () => {
        realWeather.value = { status: "known", weather: "fog" };
        wamSettings.value = { weather: "clear" };
        render();
        expect(realPanel()).toBe("");
        click(tile("Real"));
        expect(realPanel()).toBe("Paris now: Fog");
        expect(target.querySelector('a[href="https://open-meteo.com/"]')?.textContent?.trim()).toBe("Open-Meteo");
        expect(target.querySelector('[data-testid="map-weather-frequency"]')).toBeNull();
        click(saveButton());
        await vi.waitFor(() => expect(executeUpdateWAMSettings).toHaveBeenCalledTimes(1));
        expect(executeUpdateWAMSettings.mock.calls[0][0]).toMatchObject({
            updateWeatherSettingMessage: { weather: "real" },
        });
    });

    it("says when the weather is still being checked or the service is down", () => {
        wamSettings.value = { weather: "real" };
        render();
        expect(tile("Real").getAttribute("aria-checked")).toBe("true");
        expect(realPanel()).toBe("real pending");
    });

    it("says the Auto weather takes over while the service is down", () => {
        realWeather.value = { status: "unavailable" };
        wamSettings.value = { weather: "real" };
        render();
        expect(realPanel()).toBe("real unavailable");
    });
});

describe("WeatherSettings, live preview and place", () => {
    const lyon = { name: "Lyon, Auvergne-Rhône-Alpes, France", latitude: 45.74906, longitude: 4.84789 };

    it("shows the tile being tried at once, for this person only, and stops when the panel closes", async () => {
        wamSettings.value = { weather: "clear" };
        render();
        expect(tried.value).toBeUndefined();
        click(tile("Storm"));
        expect(tried.value).toMatchObject({ weather: "storm" });
        expect(target.querySelector('[data-testid="map-weather-preview-hint"]')?.textContent?.trim()).toBe(
            "preview hint",
        );
        click(tile("Clear"));
        expect(tried.value).toBeUndefined();
        click(tile("Snow"));
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        expect(tried.value).toBeUndefined();
    });

    it("finds a town, tries it and saves it as the place of the map", async () => {
        vi.useRealTimers();
        searchPlaces.mockResolvedValue([lyon]);
        wamSettings.value = { weather: "real" };
        render();
        expect(target.querySelector('[data-testid="map-location-current"]')?.textContent?.trim()).toBe(
            "Paris (default)",
        );
        const input = target.querySelector<HTMLInputElement>('[data-testid="map-location-search"]');
        if (!input) throw new Error("no search field");
        input.value = "Lyon";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await vi.waitFor(() =>
            expect(target.querySelector('[data-testid="map-location-results"] button')).not.toBeNull(),
        );
        expect(searchPlaces).toHaveBeenCalledWith("Lyon", expect.any(AbortSignal));
        click(
            target.querySelector<HTMLButtonElement>('[data-testid="map-location-results"] button') as HTMLButtonElement,
        );
        expect(target.querySelector('[data-testid="map-location-current"]')?.textContent?.trim()).toBe(lyon.name);
        expect(tried.value).toMatchObject({ weather: "real", weatherLocation: lyon });
        click(saveButton());
        await vi.waitFor(() => expect(executeUpdateWAMSettings).toHaveBeenCalledTimes(1));
        expect(executeUpdateWAMSettings.mock.calls[0][0]).toMatchObject({
            updateWeatherSettingMessage: { weather: "real", location: lyon },
        });
    });
});
