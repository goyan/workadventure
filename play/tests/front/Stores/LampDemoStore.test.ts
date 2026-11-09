import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

describe("lampDemoEnabledStore", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });
    afterEach(() => {
        localStorage.clear();
    });

    async function load() {
        return (await import("../../../src/front/Stores/LampDemoStore")).lampDemoEnabledStore;
    }

    it("is off until the user turns it on: nobody gets demo lamps by surprise", async () => {
        expect(get(await load())).toBe(false);
    });

    it("keeps the choice in the browser, so that the installed app and a tab of the profile share it", async () => {
        const store = await load();
        store.set(true);
        expect(localStorage.getItem("lampDemoEnabled")).toBe("true");
        store.set(false);
        expect(localStorage.getItem("lampDemoEnabled")).toBe("false");
    });

    it("starts on when it was left on", async () => {
        localStorage.setItem("lampDemoEnabled", "true");
        expect(get(await load())).toBe(true);
    });

    it("can be flipped with update", async () => {
        const store = await load();
        store.update((enabled) => !enabled);
        expect(get(store)).toBe(true);
    });
});
