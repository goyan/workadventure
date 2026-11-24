import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "weatherRainAmountSteps";
const FIRST_VERSION_KEY = "weatherRainAmount";

/** The stores as a page that has just loaded with this in the browser storage (null: nothing kept). */
async function loadWith(kept: string | null) {
    vi.resetModules();
    localStorage.clear();
    if (kept !== null) localStorage.setItem(KEY, kept);
    return import("../../../src/front/Stores/WeatherStore");
}

describe("the personal amount of rain and snow", () => {
    beforeEach(() => localStorage.clear());

    it("is 1 until chosen, and goes by steps of a slider from ×1 to ×32", async () => {
        const { rainAmountStore, rainAmountStepStore, RAIN_AMOUNT_LAST_STEP } = await loadWith(null);
        expect(get(rainAmountStore)).toBe(1);
        expect(get(rainAmountStepStore)).toBe(0);
        const amounts = [];
        for (let step = 0; step <= RAIN_AMOUNT_LAST_STEP; step++) {
            rainAmountStepStore.set(step);
            amounts.push(get(rainAmountStore));
            expect(get(rainAmountStepStore)).toBe(step);
        }
        expect(amounts).toEqual([1, 2, 4, 8, 16, 32]);
        expect(RAIN_AMOUNT_LAST_STEP).toBe(5);
    });

    it("keeps what is chosen, and snaps what is not a step", async () => {
        const { rainAmountStore } = await loadWith(null);
        rainAmountStore.set(8);
        expect(localStorage.getItem(KEY)).toBe("8");
        rainAmountStore.set(5);
        expect(get(rainAmountStore)).toBe(4);
        rainAmountStore.set(1000);
        expect(get(rainAmountStore)).toBe(32);
        rainAmountStore.set(0);
        expect(get(rainAmountStore)).toBe(1);
        rainAmountStore.update((amount) => amount * 2);
        expect(get(rainAmountStore)).toBe(2);
    });

    it.each(["0.25", "1", "1.5", "2"])(
        "starts again at ×1 whatever the first version kept (%s): its values are all under the new ×1",
        async (kept) => {
            vi.resetModules();
            localStorage.clear();
            localStorage.setItem(FIRST_VERSION_KEY, kept);
            const { rainAmountStore } = await import("../../../src/front/Stores/WeatherStore");
            expect(get(rainAmountStore)).toBe(1);
        },
    );

    it.each(["loud", "", "NaN"])("falls back to ×1 when what is kept (%j) is not a number", async (kept) => {
        const { rainAmountStore } = await loadWith(kept);
        expect(get(rainAmountStore)).toBe(1);
    });
});
