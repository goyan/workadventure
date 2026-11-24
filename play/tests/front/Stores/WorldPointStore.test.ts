import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The store as a page opening reads it again from the browser. */
async function reloaded() {
    vi.resetModules();
    return (await import("../../../src/front/Stores/NightStore")).worldPointStore;
}

afterEach(() => {
    localStorage.removeItem("nightWorldPoint");
});

describe("worldPointStore", () => {
    it("keeps a town chosen by its name with its name and time zone, for the next visit", async () => {
        const store = await reloaded();
        store.set({
            latitude: 50.63,
            longitude: 3.06,
            name: "Lille, Hauts-de-France, France",
            timezone: "Europe/Paris",
        });
        expect(get(await reloaded())).toEqual({
            latitude: 50.63,
            longitude: 3.06,
            name: "Lille, Hauts-de-France, France",
            timezone: "Europe/Paris",
        });
    });

    it("keeps a point clicked on the map, and drops a name or a zone that is not one", async () => {
        localStorage.setItem("nightWorldPoint", JSON.stringify({ latitude: -72.4, longitude: 170.2 }));
        expect(get(await reloaded())).toEqual({ latitude: -72.4, longitude: 170.2 });
        localStorage.setItem(
            "nightWorldPoint",
            JSON.stringify({ latitude: 1, longitude: 2, name: 42, timezone: "Not/AZone" }),
        );
        expect(get(await reloaded())).toEqual({ latitude: 1, longitude: 2 });
    });
});
