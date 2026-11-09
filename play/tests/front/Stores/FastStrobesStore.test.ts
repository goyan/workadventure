import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

describe("fastStrobesEnabledStore", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });
    afterEach(() => {
        localStorage.clear();
    });

    async function load() {
        return (await import("../../../src/front/Stores/FastStrobesStore")).fastStrobesEnabledStore;
    }

    it("is off until the player turns it on: nobody gets fast strobes by surprise", async () => {
        expect(get(await load())).toBe(false);
    });

    it("keeps the choice in the browser", async () => {
        const store = await load();
        store.set(true);
        expect(localStorage.getItem("fastStrobesEnabled")).toBe("true");
        store.set(false);
        expect(localStorage.getItem("fastStrobesEnabled")).toBe("false");
    });

    it("starts on only when it was left on", async () => {
        localStorage.setItem("fastStrobesEnabled", "true");
        expect(get(await load())).toBe(true);
        vi.resetModules();
        localStorage.setItem("fastStrobesEnabled", "yes");
        expect(get(await load())).toBe(false);
    });
});
