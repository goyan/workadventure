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
