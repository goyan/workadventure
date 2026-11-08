import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { ChristmasThemeMode } from "../../../src/front/Phaser/Game/Christmas/ChristmasSeason";

async function loadStore() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/ChristmasThemeStore")).christmasThemeModeStore;
}

afterEach(() => {
    localStorage.removeItem("christmasTheme");
});

describe("christmasThemeModeStore", () => {
    it("defaults to auto", async () => {
        expect(get(await loadStore())).toBe(ChristmasThemeMode.Auto);
    });

    it("restores a saved mode", async () => {
        localStorage.setItem("christmasTheme", "never");
        expect(get(await loadStore())).toBe(ChristmasThemeMode.Never);
    });

    it("falls back to auto on an unknown value", async () => {
        localStorage.setItem("christmasTheme", "sometimes");
        expect(get(await loadStore())).toBe(ChristmasThemeMode.Auto);
    });

    it("persists on set", async () => {
        const store = await loadStore();
        store.set(ChristmasThemeMode.Always);
        expect(localStorage.getItem("christmasTheme")).toBe("always");
        expect(get(store)).toBe(ChristmasThemeMode.Always);
    });
});
