import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

async function load() {
    vi.resetModules();
    return import("../../../src/front/Stores/SeasonalThemeStore");
}

describe("seasonalThemeModeStore", () => {
    beforeEach(() => localStorage.clear());

    it("migrates christmasTheme once and forgets the old keys", async () => {
        localStorage.setItem("christmasTheme", "always");
        localStorage.setItem("groundMode", "seasonal");
        const { seasonalThemeModeStore } = await load();
        // The Christmas theme is gone: its former "always" follows the calendar.
        expect(get(seasonalThemeModeStore)).toBe("auto");
        expect(localStorage.getItem("seasonalTheme")).toBe("auto");
        expect(localStorage.getItem("christmasTheme")).toBeNull();
        expect(localStorage.getItem("groundMode")).toBeNull();
    });

    it("prefers seasonalTheme over the old key", async () => {
        localStorage.setItem("seasonalTheme", "autumn");
        localStorage.setItem("christmasTheme", "always");
        const { seasonalThemeModeStore } = await load();
        expect(get(seasonalThemeModeStore)).toBe("autumn");
    });

    it("reads a saved Christmas theme, now gone, as auto", async () => {
        localStorage.setItem("seasonalTheme", "christmas");
        const { seasonalThemeModeStore } = await load();
        expect(get(seasonalThemeModeStore)).toBe("auto");
    });

    it("defaults to auto", async () => {
        const { seasonalThemeModeStore } = await load();
        expect(get(seasonalThemeModeStore)).toBe("auto");
    });

    it("persists a change", async () => {
        const { seasonalThemeModeStore } = await load();
        const { SeasonalThemeMode } = await import("../../../src/front/Phaser/Game/Seasonal/SeasonalTheme");
        seasonalThemeModeStore.set(SeasonalThemeMode.None);
        expect(localStorage.getItem("seasonalTheme")).toBe("none");
    });
});
