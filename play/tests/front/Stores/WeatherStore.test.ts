import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

describe("ground preference", () => {
    beforeEach(() => {
        localStorage.removeItem("groundMode");
        vi.resetModules();
    });
    afterEach(() => {
        localStorage.removeItem("groundMode");
        vi.resetModules();
    });
    it("defaults to green for new users and invalid saved preferences", async () => {
        const { GroundMode, groundModeStore } = await import("@wa/front/Stores/WeatherStore");
        expect(get(groundModeStore)).toBe(GroundMode.Green);
        localStorage.setItem("groundMode", "invalid");
        vi.resetModules();
        const reloaded = await import("@wa/front/Stores/WeatherStore");
        expect(get(reloaded.groundModeStore)).toBe(reloaded.GroundMode.Green);
    });
    it("persists an explicit seasonal choice across reloads", async () => {
        const { GroundMode, groundModeStore } = await import("@wa/front/Stores/WeatherStore");
        groundModeStore.set(GroundMode.Seasonal);
        expect(localStorage.getItem("groundMode")).toBe(GroundMode.Seasonal);
        vi.resetModules();
        const reloaded = await import("@wa/front/Stores/WeatherStore");
        expect(get(reloaded.groundModeStore)).toBe(reloaded.GroundMode.Seasonal);
    });
});
