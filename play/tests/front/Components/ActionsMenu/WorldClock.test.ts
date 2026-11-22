import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { flushSync, mount, unmount } from "svelte";
import WorldClock from "../../../../src/front/Components/ActionsMenu/WorldClock.svelte";
import { basicModeStore } from "../../../../src/front/Stores/BasicModeStore";
import {
    NightMode,
    nightDateStore,
    nightModeStore,
    worldCityStore,
    worldMomentStore,
    worldPointStore,
} from "../../../../src/front/Stores/NightStore";
import { WorldMoment } from "../../../../src/front/Phaser/Game/Night/WorldDaylight";
import { WorldFall } from "../../../../src/front/Phaser/Game/Night/WorldWeatherPick";
import { chooseWorldFall, worldFallNoticeStore, worldFallStore } from "../../../../src/front/Stores/WorldFallStore";
import { enableUserInputsStore } from "../../../../src/front/Stores/UserInputStore";

const searchPlaces = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/front/Phaser/Game/Weather/RealWeatherClient", () => ({ searchPlaces }));

// Every label reads as its own key, with its parameters: what is shown is told apart without the real translations.
vi.mock("../../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const label =
        (path: string) =>
        (parameters?: Record<string, string>): string =>
            parameters ? `${path}(${Object.values(parameters).join(",")})` : path;
    const tree = (path: string): unknown =>
        new Proxy(label(path), { get: (_target, key) => tree(`${path}.${String(key)}`) });
    return { LL: readable(tree("LL")), locale: readable("fr-FR") };
});

describe("WorldClock", () => {
    const target = document.createElement("div");
    let component: ReturnType<typeof mount> | undefined;

    beforeEach(() => {
        nightDateStore.set(new Date("2026-11-21T00:44:00Z"));
        nightModeStore.set(NightMode.Server);
        basicModeStore.set(false);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
        target.replaceChildren();
        basicModeStore.set(false);
        worldPointStore.set(undefined);
        worldCityStore.set(undefined);
        worldFallStore.set(undefined);
        worldFallNoticeStore.set(undefined);
        vi.unstubAllGlobals();
    });

    function openMenu(): void {
        component = mount(WorldClock, { target, intro: false });
        flushSync();
        target.querySelector<HTMLButtonElement>("[data-testid='world-clock-button']")?.click();
        flushSync();
    }

    const pressed = (mode: NightMode): string | null | undefined =>
        target.querySelector(`[data-testid='world-clock-mode-${mode}']`)?.getAttribute("aria-pressed");

    it("shows the mode chosen, and no word of Basique, while Basique is off", () => {
        openMenu();
        expect(pressed(NightMode.Server)).toBe("true");
        expect(target.querySelector("[data-testid='world-clock-basic']")).toBeNull();
    });

    it("says that Basique turns the night off, and shows the cycle off rather than the mode kept for later", () => {
        basicModeStore.set(true);
        openMenu();
        const line = target.querySelector("[data-testid='world-clock-basic']");
        expect(line?.textContent).toContain("LL.menu.settings.night.basicOff(LL.menu.settings.night.server)");
        expect(pressed(NightMode.Disabled)).toBe("true");
        expect(pressed(NightMode.Server)).toBe("false");
    });

    it("says that the sky comes from the point chosen on the map, when no moment is pressed", () => {
        nightModeStore.set(NightMode.World);
        worldMomentStore.set(WorldMoment.Evening);
        worldPointStore.set({ latitude: 69, longitude: -79 });
        worldCityStore.set({ name: "Montréal", latitude: 69, longitude: -79 });
        openMenu();
        const city = target.querySelector("[data-testid='world-clock-city']");
        expect(city?.textContent).toContain("LL.menu.settings.night.worldPointCity(Montréal)");
        expect(target.querySelector("[data-testid='world-clock-moment-evening']")?.getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("names the city of the moment pressed, without the point", () => {
        nightModeStore.set(NightMode.World);
        worldMomentStore.set(WorldMoment.Evening);
        worldCityStore.set({ name: "Dakar", latitude: 14.72, longitude: -17.47 });
        openMenu();
        const city = target.querySelector("[data-testid='world-clock-city']");
        expect(city?.textContent).toContain("LL.menu.settings.night.worldCity(Dakar)");
        expect(target.querySelector("[data-testid='world-clock-moment-evening']")?.getAttribute("aria-pressed")).toBe(
            "true",
        );
    });

    const LISBON = { name: "Lisbonne", latitude: 38.72, longitude: -9.14, timezone: "Europe/Lisbon" };
    const fallButton = (fall: WorldFall): HTMLButtonElement | null =>
        target.querySelector<HTMLButtonElement>(`[data-testid='world-clock-fall-${fall}']`);

    it("offers to look for a place of the world where it rains or snows, next to the moments", () => {
        nightModeStore.set(NightMode.World);
        openMenu();
        expect(fallButton(WorldFall.Rain)?.textContent).toContain("LL.menu.settings.night.worldRain");
        expect(fallButton(WorldFall.Snow)?.textContent).toContain("LL.menu.settings.night.worldSnow");
        expect(fallButton(WorldFall.Rain)?.querySelector("[data-testid='pixel-icon']")).not.toBeNull();
        expect(fallButton(WorldFall.Rain)?.getAttribute("aria-pressed")).toBe("false");
    });

    it("says why the sky is that of the place picked, with how hard it falls, and presses its button only", () => {
        nightModeStore.set(NightMode.World);
        worldMomentStore.set(WorldMoment.Evening);
        worldFallStore.set({ fall: WorldFall.Rain, place: LISBON, rainRate: 2.4 });
        worldCityStore.set(LISBON);
        openMenu();
        const city = target.querySelector("[data-testid='world-clock-city']");
        expect(city?.textContent).toContain("LL.menu.settings.night.worldRainCity(Lisbonne,2,4)");
        expect(fallButton(WorldFall.Rain)?.getAttribute("aria-pressed")).toBe("true");
        expect(target.querySelector("[data-testid='world-clock-moment-evening']")?.getAttribute("aria-pressed")).toBe(
            "false",
        );
    });

    it("says it snows lightly when no water is counted yet", () => {
        nightModeStore.set(NightMode.World);
        worldFallStore.set({ fall: WorldFall.Snow, place: LISBON, rainRate: 0 });
        worldCityStore.set(LISBON);
        openMenu();
        expect(target.querySelector("[data-testid='world-clock-city']")?.textContent).toContain(
            "LL.menu.settings.night.worldSnowCityLight(Lisbonne)",
        );
    });

    it("says it snows nowhere in the list, and keeps the place followed", async () => {
        nightModeStore.set(NightMode.World);
        worldMomentStore.set(WorldMoment.Noon);
        worldCityStore.set({ name: "Dakar", latitude: 14.72, longitude: -17.47 });
        await chooseWorldFall(WorldFall.Snow, () => Promise.resolve({ status: "none" }));
        openMenu();
        expect(target.querySelector("[data-testid='world-clock-fall-notice']")?.textContent).toContain(
            "LL.menu.settings.night.worldNoSnow",
        );
        expect(target.querySelector("[data-testid='world-clock-city']")?.textContent).toContain(
            "LL.menu.settings.night.worldCity(Dakar)",
        );
        expect(target.querySelector("[data-testid='world-clock-moment-noon']")?.getAttribute("aria-pressed")).toBe(
            "true",
        );
    });

    it("says the weather of the world could not be read, and changes nothing", async () => {
        worldFallStore.set({ fall: WorldFall.Rain, place: LISBON, rainRate: 1 });
        await chooseWorldFall(WorldFall.Snow, () => Promise.resolve({ status: "failed" }));
        nightModeStore.set(NightMode.World);
        openMenu();
        expect(target.querySelector("[data-testid='world-clock-fall-notice']")?.textContent).toContain(
            "LL.menu.settings.night.worldFallFailed",
        );
        expect(target.querySelector("[data-testid='world-clock-city']")?.getAttribute("data-fall")).toBe("rain");
    });

    it("asks the weather of the world at a click, and follows the place where it rains", async () => {
        const answer = {
            at: 0,
            places: [
                {
                    name: "Lisbonne",
                    weatherCode: 61,
                    temperature: 14,
                    humidity: 90,
                    rainRate: 1.2,
                    isDay: true,
                },
            ],
        };
        const fetchMock = vi.fn<typeof fetch>(() =>
            Promise.resolve(new Response(JSON.stringify(answer), { status: 200 })),
        );
        vi.stubGlobal("fetch", fetchMock);
        nightModeStore.set(NightMode.World);
        worldPointStore.set({ latitude: 10, longitude: 10 });
        openMenu();
        fallButton(WorldFall.Rain)?.click();
        await vi.waitFor(() => {
            let value: unknown;
            worldFallStore.subscribe((choice) => (value = choice))();
            expect(value).toMatchObject({ fall: WorldFall.Rain, place: { name: "Lisbonne" }, rainRate: 1.2 });
        });
        const asked = fetchMock.mock.calls[0]?.[0];
        expect(asked instanceof URL ? asked.pathname : asked).toMatch(/real-weather\/world$/);
        let point: unknown = "unset";
        worldPointStore.subscribe((value) => (point = value))();
        expect(point).toBeUndefined();
    });

    it("leaves the place picked for a moment", () => {
        nightModeStore.set(NightMode.World);
        worldFallStore.set({ fall: WorldFall.Rain, place: LISBON, rainRate: 1 });
        openMenu();
        target.querySelector<HTMLButtonElement>("[data-testid='world-clock-moment-morning']")?.click();
        flushSync();
        let value: unknown = "unset";
        worldFallStore.subscribe((choice) => (value = choice))();
        expect(value).toBeUndefined();
    });
});

describe("WorldClock, a place by its name", () => {
    const target = document.createElement("div");
    let component: ReturnType<typeof mount> | undefined;
    const HONG_KONG = {
        name: "Hong Kong, Hong Kong",
        latitude: 22.28,
        longitude: 114.16,
        timezone: "Asia/Hong_Kong",
    };

    beforeEach(() => {
        nightDateStore.set(new Date("2026-11-21T00:44:00Z"));
        nightModeStore.set(NightMode.World);
        basicModeStore.set(false);
        searchPlaces.mockReset();
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
        target.replaceChildren();
        worldPointStore.set(undefined);
        worldCityStore.set(undefined);
    });

    function openMenu(): void {
        component = mount(WorldClock, { target, intro: false });
        flushSync();
        target.querySelector<HTMLButtonElement>("[data-testid='world-clock-button']")?.click();
        flushSync();
    }
    const field = (): HTMLInputElement | null =>
        target.querySelector<HTMLInputElement>("[data-testid='world-clock-search']");

    it("puts the search field above the help and the map of the world", () => {
        openMenu();
        const input = field();
        const map = target.querySelector("[data-testid='world-clock-map']");
        expect(input).not.toBeNull();
        expect(map).not.toBeNull();
        if (!input || !map) return;
        expect(input.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(input.placeholder).toBe("LL.mapEditor.settings.weather.location.search");
    });

    it("follows a town chosen by its name, named after it at its own time zone, with Enter", async () => {
        searchPlaces.mockResolvedValue([HONG_KONG]);
        openMenu();
        const input = field();
        if (!input) throw new Error("no field");
        input.value = "Hong";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await vi.waitFor(() =>
            expect(target.querySelector("[data-testid='world-clock-search-results'] button")).not.toBeNull(),
        );
        // Only the text typed is asked for.
        expect(searchPlaces).toHaveBeenCalledWith("Hong", expect.any(AbortSignal));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        flushSync();
        expect(get(worldPointStore)).toEqual({
            latitude: 22.28,
            longitude: 114.16,
            name: "Hong Kong, Hong Kong",
            timezone: "Asia/Hong_Kong",
        });
        // Named after the town, not "a point chosen on the map".
        worldCityStore.set({ name: "Hong Kong", latitude: 22.28, longitude: 114.16, timezone: "Asia/Hong_Kong" });
        flushSync();
        expect(target.querySelector("[data-testid='world-clock-city']")?.textContent).toContain(
            "LL.menu.settings.night.worldCity(Hong Kong)",
        );
    });

    it("shows the place of a click on the map in the field", () => {
        openMenu();
        const map = target.querySelector<HTMLCanvasElement>("[data-testid='world-clock-map']");
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
        map.dispatchEvent(new MouseEvent("click", { clientX: 200, clientY: 40, bubbles: true }));
        flushSync();
        expect(get(worldPointStore)).toEqual({ latitude: 30, longitude: 120 });
        // The night manager names the point; the field shows that name.
        worldCityStore.set({
            name: "Shanghai 300 km",
            longName: "30° N 120° E · Shanghai à 300 km",
            latitude: 30,
            longitude: 120,
        });
        flushSync();
        expect(field()?.value).toBe("30° N 120° E · Shanghai à 300 km");
    });

    it("keeps the keys of the game still while the player types, and closes only the list with Escape", async () => {
        searchPlaces.mockResolvedValue([HONG_KONG]);
        openMenu();
        const input = field();
        if (!input) throw new Error("no field");
        input.dispatchEvent(new FocusEvent("focus"));
        expect(get(enableUserInputsStore)).toBe(false);
        input.value = "Hong";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await vi.waitFor(() =>
            expect(target.querySelector("[data-testid='world-clock-search-results']")).not.toBeNull(),
        );
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();
        expect(target.querySelector("[data-testid='world-clock-search-results']")).toBeNull();
        // The menu stays open: Escape closed the list only.
        expect(target.querySelector("[data-testid='world-clock-menu']")).not.toBeNull();
        input.dispatchEvent(new FocusEvent("blur"));
        expect(get(enableUserInputsStore)).toBe(true);
    });
});
