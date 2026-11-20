import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";
import { basicActiveStore, basicModeStore, isBasicActive, unlessBasic } from "../../../src/front/Stores/BasicModeStore";
import { EFFECTS, effectShownStores, isEffectShown } from "../../../src/front/Stores/EffectsStore";
import { mapEditorModeStore } from "../../../src/front/Stores/MapEditorStore";
import { cloudsShownStore, weatherEffectsEnabledStore } from "../../../src/front/Stores/WeatherStore";
import { lampEffectsEnabledStore } from "../../../src/front/Stores/LampEffectsStore";

/** The effects Basique hides: every one but the sounds and the animals placed on the map, which keep their switch. */
const VISUAL_EFFECTS = EFFECTS.filter((name) => name !== "callRing" && name !== "wanderers");

afterEach(() => {
    basicModeStore.set(false);
    mapEditorModeStore.switchMode(false);
    for (const name of EFFECTS) effectShownStores[name].set(true);
});

describe("Basique", () => {
    it("is off by default, and hides every visual effect once on, without touching their settings", () => {
        expect(get(basicModeStore)).toBe(false);
        for (const name of VISUAL_EFFECTS) expect(isEffectShown(name)).toBe(true);

        basicModeStore.set(true);
        for (const name of VISUAL_EFFECTS) expect(isEffectShown(name)).toBe(false);
        // The settings themselves are kept as they were: turned off, Basique gives them back.
        for (const name of EFFECTS) expect(get(effectShownStores[name])).toBe(true);
        expect(get(weatherEffectsEnabledStore)).toBe(true);

        basicModeStore.set(false);
        for (const name of VISUAL_EFFECTS) expect(isEffectShown(name)).toBe(true);
    });

    it("hides the weather, the clouds and the lamp effects the managers read through it", () => {
        const shown = [weatherEffectsEnabledStore, cloudsShownStore, lampEffectsEnabledStore].map(unlessBasic);
        weatherEffectsEnabledStore.set(true);
        cloudsShownStore.set(true);
        lampEffectsEnabledStore.set(true);
        for (const store of shown) expect(get(store)).toBe(true);
        basicModeStore.set(true);
        for (const store of shown) expect(get(store)).toBe(false);
    });

    it("never shows an effect its own setting turned off", () => {
        const setting = writable(false);
        expect(get(unlessBasic(setting))).toBe(false);
        effectShownStores.fire.set(false);
        expect(isEffectShown("fire")).toBe(false);
    });

    it("does not apply in the map editor, where the relief and the water must be seen to be edited", () => {
        basicModeStore.set(true);
        expect(isBasicActive()).toBe(true);
        mapEditorModeStore.switchMode(true);
        expect(get(basicActiveStore)).toBe(false);
        for (const name of VISUAL_EFFECTS) expect(isEffectShown(name)).toBe(true);
    });
});
