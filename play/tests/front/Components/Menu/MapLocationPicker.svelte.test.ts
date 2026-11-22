import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable } from "svelte/store";

const searchPlaces = vi.hoisted(() => vi.fn<(query: string, signal: AbortSignal) => Promise<unknown[]>>());

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        mapEditor: {
            settings: {
                weather: {
                    location: {
                        title: label("Place"),
                        default: label("Paris (default)"),
                        search: label("Search"),
                        map: label("Map of the world"),
                        searching: label("Searching"),
                        noResult: label("No town"),
                        error: label("Search unavailable"),
                        hint: label("place hint"),
                        reset: label("Back to Paris"),
                    },
                },
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({ searchPlaces }));
vi.mock("../../../../src/front/Phaser/Game/Night/PointWords", () => ({
    pointWords: () => ({
        north: "N",
        south: "S",
        east: "E",
        west: "W",
        far: (point: string, city: string, distance: string) => `${point} · ${city} ${distance} km away`,
        short: (city: string, distance: string) => `${city} ${distance} km`,
        kilometres: (km: number) => new Intl.NumberFormat("en-US").format(km),
    }),
}));

import MapLocationPicker from "../../../../src/front/Components/Menu/MapLocationPicker.svelte";

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;

function render(): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(MapLocationPicker, { target, props: { location: undefined } });
    flushSync();
}

function type(text: string): void {
    const input = target.querySelector<HTMLInputElement>('[data-testid="map-location-search"]');
    if (!input) throw new Error("no search field");
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

function text(): string {
    return target.textContent?.replace(/\s+/g, " ") ?? "";
}

beforeEach(() => {
    vi.useFakeTimers();
    searchPlaces.mockReset();
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    vi.useRealTimers();
});

describe("MapLocationPicker", () => {
    it("asks once the typing pauses, from two characters, and tells when no town is found", async () => {
        searchPlaces.mockResolvedValue([]);
        render();
        type("L");
        await vi.advanceTimersByTimeAsync(500);
        expect(searchPlaces).not.toHaveBeenCalled();
        type("Ly");
        type("Lyo");
        await vi.advanceTimersByTimeAsync(299);
        expect(searchPlaces).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(searchPlaces).toHaveBeenCalledOnce();
        expect(searchPlaces.mock.calls[0][0]).toBe("Lyo");
        flushSync();
        expect(text()).toContain("No town");
    });

    it("says the search is unavailable when it fails", async () => {
        searchPlaces.mockRejectedValue(new Error("Place search failed (502)"));
        render();
        type("Brest");
        await vi.advanceTimersByTimeAsync(300);
        flushSync();
        expect(text()).toContain("Search unavailable");
    });

    it("drops the answer of a search typed over, and cancels it", async () => {
        let first: AbortSignal | undefined;
        searchPlaces.mockImplementationOnce((_query, signal) => {
            first = signal;
            return new Promise<unknown[]>(() => {
                // Never answers: typed over first.
            });
        });
        searchPlaces.mockResolvedValueOnce([{ name: "Brest, France", latitude: 48.39, longitude: -4.49 }]);
        render();
        type("Lyon");
        await vi.advanceTimersByTimeAsync(300);
        expect(text()).toContain("Searching");
        type("Brest");
        expect(first?.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(300);
        flushSync();
        expect(target.querySelector('[data-testid="map-location-results"]')?.textContent).toContain("Brest, France");
    });
});

describe("MapLocationPicker, the map of the world", () => {
    function clickMap(clientX: number, clientY: number): void {
        const map = target.querySelector<HTMLCanvasElement>('[data-testid="map-location-map"]');
        if (!map) throw new Error("no map");
        vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
            left: 0,
            top: 0,
            width: 240,
            height: 120,
            right: 240,
            bottom: 120,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        });
        map.dispatchEvent(new MouseEvent("click", { clientX, clientY, bubbles: true }));
        flushSync();
    }
    const field = (): string | undefined =>
        target.querySelector<HTMLInputElement>('[data-testid="map-location-search"]')?.value;

    it("makes a point clicked far from any city the place of the map, by its coordinates, shown in the field", () => {
        render();
        expect(target.querySelector('[data-testid="map-location-map"]')?.getAttribute("aria-label")).toBe(
            "Map of the world",
        );
        // 72° S 170° E: the Ross Sea.
        clickMap(233, 108);
        const current = target.querySelector('[data-testid="map-location-current"]')?.textContent?.trim() ?? "";
        expect(current).toMatch(/^72° S 170° E · .+ [\d,]+ km away$/);
        expect(field()).toBe(current);
    });

    it("names a point near a city of the list after it, and shows a town chosen by its name in the field", async () => {
        searchPlaces.mockResolvedValue([{ name: "Brest, France", latitude: 48.39, longitude: -4.49 }]);
        render();
        // Next to Paris.
        clickMap(121.6, 27.4);
        expect(target.querySelector('[data-testid="map-location-current"]')?.textContent?.trim()).toBe("Paris");
        type("Bre");
        await vi.advanceTimersByTimeAsync(400);
        target.querySelector<HTMLButtonElement>('[data-testid="map-location-results"] button')?.click();
        flushSync();
        expect(target.querySelector('[data-testid="map-location-current"]')?.textContent?.trim()).toBe("Brest, France");
        expect(field()).toBe("Brest");
    });
});
