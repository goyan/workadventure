import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

// The store reads localStorage once at import time, so each test re-imports a fresh module.
async function loadStore() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/NightStore")).nightDisabledStore;
}

describe("nightDisabledStore", () => {
    beforeEach(() => localStorage.clear());

    it("is false when nothing was saved", async () => {
        expect(get(await loadStore())).toBe(false);
    });

    it("reads the saved value at startup", async () => {
        localStorage.setItem("disableNight", "true");
        expect(get(await loadStore())).toBe(true);
    });

    it("persists every set", async () => {
        const store = await loadStore();
        store.set(true);
        expect(localStorage.getItem("disableNight")).toBe("true");
        store.set(false);
        expect(localStorage.getItem("disableNight")).toBe("false");
    });

    it("persists every update", async () => {
        const store = await loadStore();
        store.update((v) => !v);
        expect(get(store)).toBe(true);
        expect(localStorage.getItem("disableNight")).toBe("true");
    });
});
