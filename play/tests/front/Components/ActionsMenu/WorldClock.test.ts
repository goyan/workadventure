import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
