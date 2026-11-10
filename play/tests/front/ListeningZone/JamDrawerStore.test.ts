import { beforeEach, describe, expect, it } from "vitest";
import { get, writable } from "svelte/store";
import { createJamDrawer, JAM_DRAWER_STORAGE_KEY } from "../../../src/front/ListeningZone/JamDrawerStore";

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
            values.set(key, value);
        },
    };
}

describe("Jam drawer", () => {
    let zone: ReturnType<typeof writable<unknown>>;

    beforeEach(() => {
        zone = writable<unknown>(undefined);
    });

    it("starts closed when the user never chose", () => {
        const drawer = createJamDrawer(memoryStorage(), zone);
        expect(get(drawer.open)).toBe(false);
    });

    it("toggles, and remembers the choice for the next visit", () => {
        const storage = memoryStorage();
        const drawer = createJamDrawer(storage, zone);
        drawer.toggle();
        expect(get(drawer.open)).toBe(true);
        expect(storage.getItem(JAM_DRAWER_STORAGE_KEY)).toBe("open");
        expect(get(createJamDrawer(storage, zone).open)).toBe(true);

        drawer.toggle();
        expect(get(drawer.open)).toBe(false);
        expect(get(createJamDrawer(storage, zone).open)).toBe(false);
    });

    it("opens by itself on entering a listening zone, and closes again on leaving it", () => {
        const drawer = createJamDrawer(memoryStorage(), zone);
        zone.set({ areaId: "a" });
        expect(get(drawer.open)).toBe(true);
        zone.set(undefined);
        expect(get(drawer.open)).toBe(false);
    });

    it("stays closed on entering a zone once the user closed it", () => {
        const drawer = createJamDrawer(memoryStorage({ [JAM_DRAWER_STORAGE_KEY]: "closed" }), zone);
        zone.set({ areaId: "a" });
        expect(get(drawer.open)).toBe(false);
    });

    it("stays open on leaving a zone when the user opened it", () => {
        const drawer = createJamDrawer(memoryStorage(), zone);
        zone.set({ areaId: "a" });
        drawer.toggle();
        drawer.toggle();
        zone.set(undefined);
        expect(get(drawer.open)).toBe(true);
    });

    it("does not reopen when moving from one zone straight to another after a close", () => {
        const drawer = createJamDrawer(memoryStorage(), zone);
        zone.set({ areaId: "a" });
        drawer.toggle();
        zone.set({ areaId: "b" });
        expect(get(drawer.open)).toBe(false);
    });
});
