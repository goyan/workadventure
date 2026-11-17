import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { DEFAULT_SKY_LIGHT_SETTINGS } from "../../../src/front/Phaser/Game/Night/SkyLight";

beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
});

describe("skyLightSettingsStore", () => {
    it("gives the default settings until something is set", async () => {
        const { skyLightSettingsStore } = await import("../../../src/front/Stores/SkyLightStore");
        expect(get(skyLightSettingsStore)).toEqual(DEFAULT_SKY_LIGHT_SETTINGS);
    });

    it("keeps each setting in the browser, for the sun and the moon apart", async () => {
        const stores = await import("../../../src/front/Stores/SkyLightStore");
        stores.moonLightShownStore.set(false);
        stores.moonPhaseCurveStore.set("linear");
        stores.sunLightLimits.intensityMax.set(1.5);
        stores.sunLightLimits.shadowMax.set(6);
        stores.moonLightLimits.colorMin.set(0.4);
        vi.resetModules();
        const { skyLightSettingsStore } = await import("../../../src/front/Stores/SkyLightStore");
        const settings = get(skyLightSettingsStore);
        expect(settings.moon.enabled).toBe(false);
        expect(settings.sun.enabled).toBe(true);
        expect(settings.moon.phaseCurve).toBe("linear");
        expect(settings.sun.intensity).toEqual({ min: 0, max: 1.5 });
        expect(settings.sun.shadowLength).toEqual({ min: 0, max: 6 });
        expect(settings.moon.color).toEqual({ min: 0.4, max: 1 });
    });

    it("keeps each value within its slider: a length of 20 tiles is kept at 8", async () => {
        const stores = await import("../../../src/front/Stores/SkyLightStore");
        stores.sunLightLimits.shadowMax.set(20);
        stores.moonLightLimits.intensityMin.set(-1);
        const settings = get(stores.skyLightSettingsStore);
        expect(settings.sun.shadowLength.max).toBe(8);
        expect(settings.moon.intensity.min).toBe(0);
    });
});

describe("createPersistedChoiceStore", () => {
    it("keeps a choice among values, and falls back on the default for anything else kept", async () => {
        localStorage.setItem("someChoice", "purple");
        const { createPersistedChoiceStore } = await import("../../../src/front/Stores/PersistedSwitchStore");
        const store = createPersistedChoiceStore("someChoice", ["red", "blue"] as const, "red");
        expect(get(store)).toBe("red");
        store.set("blue");
        expect(localStorage.getItem("someChoice")).toBe("blue");
    });
});
