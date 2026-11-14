import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

async function freshStore() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/WeatherBannerStore")).weatherBannerStore;
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe("weatherBannerStore", () => {
    it("is hidden until the user shows it, and the choice is kept for the next visit", async () => {
        expect(get(await freshStore())).toBe(false);
        (await freshStore()).update((shown) => !shown);
        expect(get(await freshStore())).toBe(true);
        expect(localStorage.getItem("weatherBannerShown")).toBe("true");
    });

    it("still works for the page when the browser refuses to store it", async () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("denied");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("denied");
        });
        const store = await freshStore();
        expect(get(store)).toBe(false);
        store.set(true);
        expect(get(store)).toBe(true);
    });
});
