import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

async function freshStore() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/LampEffectsStore")).lampEffectsEnabledStore;
}

afterEach(() => localStorage.clear());

describe("lampEffectsEnabledStore", () => {
    it("is on until the user turns it off", async () => {
        expect(get(await freshStore())).toBe(true);
    });

    it("keeps the choice of the user in the browser, for the next visit", async () => {
        (await freshStore()).set(false);

        expect(get(await freshStore())).toBe(false);
    });

    it("keeps a toggle too", async () => {
        const store = await freshStore();
        store.update((enabled) => !enabled);
        store.update((enabled) => !enabled);

        expect(get(await freshStore())).toBe(true);
    });
});
