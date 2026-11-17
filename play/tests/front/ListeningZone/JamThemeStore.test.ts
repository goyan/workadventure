import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

describe("JamThemeStore", () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });
    afterEach(() => vi.restoreAllMocks());

    it("restores brightness and style independently after reload", async () => {
        const { JamStyle, JamTheme, jamStyleStore, jamThemeStore } =
            await import("../../../src/front/ListeningZone/JamThemeStore");
        jamStyleStore.set(JamStyle.AppleMusic);
        jamThemeStore.set(JamTheme.Dark);
        vi.resetModules();
        const reloaded = await import("../../../src/front/ListeningZone/JamThemeStore");
        expect(get(reloaded.jamThemeStore)).toBe(JamTheme.Dark);
        expect(get(reloaded.jamStyleStore)).toBe(JamStyle.AppleMusic);
    });
    it("follows WA when the stored choice is unknown", async () => {
        localStorage.setItem("jamAppearance", "unknown");
        const { JamTheme, jamThemeStore } = await import("../../../src/front/ListeningZone/JamThemeStore");
        expect(get(jamThemeStore)).toBe(JamTheme.Wa);
    });
    it("still works with blocked storage", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        const { JamTheme, jamThemeStore } = await import("../../../src/front/ListeningZone/JamThemeStore");
        expect(get(jamThemeStore)).toBe(JamTheme.Wa);
        jamThemeStore.set(JamTheme.Dark);
        expect(get(jamThemeStore)).toBe(JamTheme.Dark);
    });
});
