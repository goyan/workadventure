import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

async function freshStore() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/TorchStore")).torchIntensityStore;
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("torchIntensityStore", () => {
    it("is the full 100 % until the user sets it", async () => {
        expect(get(await freshStore())).toBe(100);
    });

    it("keeps the last intensity in the browser, for the next visit", async () => {
        (await freshStore()).set(40);

        expect(get(await freshStore())).toBe(40);
    });

    it("stays from 10 to 100 %, by steps of 10", async () => {
        const store = await freshStore();
        store.update((percent) => percent + 30);
        expect(get(store)).toBe(100);
        store.set(0);
        expect(get(store)).toBe(10);
        store.set(47);
        expect(get(store)).toBe(50);
    });

    it("ignores a value of the browser it cannot read", async () => {
        localStorage.setItem("torchIntensity", "bright");
        expect(get(await freshStore())).toBe(100);
    });

    it("keeps the intensity for the page when the browser refuses the storage", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("refused");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("refused");
        });
        const store = await freshStore();
        expect(get(store)).toBe(100);
        store.set(30);
        expect(get(store)).toBe(30);
    });
});
