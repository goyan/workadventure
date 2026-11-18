import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { NightMode } from "../../../src/front/Stores/NightStore";
import type * as NightStore from "../../../src/front/Stores/NightStore";

// Preferences are read at import time; reload the module to simulate a fresh page.
async function loadStore(): Promise<typeof NightStore> {
    vi.resetModules();
    return import("../../../src/front/Stores/NightStore");
}

describe("nightModeStore", () => {
    beforeEach(() => localStorage.clear());

    it("defaults to the shared server clock", async () => {
        const { nightModeStore, NightMode } = await loadStore();
        expect(get(nightModeStore)).toBe(NightMode.Server);
    });

    it("preserves the old disabled preference", async () => {
        localStorage.setItem("disableNight", "true");
        const { nightModeStore, NightMode } = await loadStore();
        expect(get(nightModeStore)).toBe(NightMode.Disabled);
    });

    it.each(Object.values(NightMode))("persists %s across reloads", async (mode) => {
        const { nightModeStore } = await loadStore();
        nightModeStore.set(mode);
        expect(get((await loadStore()).nightModeStore)).toBe(mode);
        expect(localStorage.getItem("disableNight")).toBe(String(mode === NightMode.Disabled));
    });

    it("persists updates", async () => {
        const { nightModeStore, NightMode } = await loadStore();
        nightModeStore.update(() => NightMode.Computer);
        expect(get((await loadStore()).nightModeStore)).toBe(NightMode.Computer);
    });

    it("ignores invalid saved clock choices", async () => {
        localStorage.setItem("nightMode", "invalid");
        const { nightModeStore, NightMode } = await loadStore();
        expect(get(nightModeStore)).toBe(NightMode.Server);
    });
});

describe("the three effects of the indirect light, each turned on or off", () => {
    it("gives the strength set while an effect is on, and none once it is off, without losing the setting", async () => {
        const night = await import("../../../src/front/Stores/NightStore");
        const { get } = await import("svelte/store");
        night.ambienceStrengthStore.set(0.3);
        night.lightSoftEdgeStore.set(12);
        night.lightBounceStore.set(0.5);
        night.ambienceOnStore.set(true);
        night.softEdgeOnStore.set(true);
        night.bounceOnStore.set(true);
        expect(get(night.shownAmbienceStrengthStore)).toBe(0.3);
        expect(get(night.shownLightSoftEdgeStore)).toBe(12);
        expect(get(night.shownLightBounceStore)).toBe(0.5);

        night.ambienceOnStore.set(false);
        night.softEdgeOnStore.set(false);
        night.bounceOnStore.set(false);
        expect(get(night.shownAmbienceStrengthStore)).toBe(0);
        expect(get(night.shownLightSoftEdgeStore)).toBe(0);
        expect(get(night.shownLightBounceStore)).toBe(0);
        // The settings are kept for when the effect is turned on again.
        expect(get(night.ambienceStrengthStore)).toBe(0.3);
        expect(get(night.lightBounceStore)).toBe(0.5);

        night.bounceOnStore.set(true);
        expect(get(night.shownLightBounceStore)).toBe(0.5);
    });
});
