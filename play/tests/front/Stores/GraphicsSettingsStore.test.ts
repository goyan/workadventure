import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../src/front/Phaser/Game/GameScene";

vi.mock("../../../src/front/Stores/GameSceneStore", () => ({
    gameSceneStore: writable<GameScene | undefined>(undefined),
}));

import {
    applyGraphicsQuality,
    GRAPHICS_PRESETS,
    GraphicsQuality,
    graphicsProfile,
    graphicsQualityStore,
    setTileAnimationsDisabled,
    tileAnimationsDisabledStore,
} from "../../../src/front/Stores/GraphicsSettingsStore";
import { readLightSettings, setLightSetting } from "../../../src/front/Stores/LightSettings";
import {
    cloudsShownStore,
    weatherEffectsEnabledStore,
    rainAmountStore,
    rainLeanStore,
    rainSplashesStore,
    rainPuddlesStore,
    rainCloudsStore,
} from "../../../src/front/Stores/WeatherStore";

const originalLights = readLightSettings();
const originalEffects = get(weatherEffectsEnabledStore);
const originalClouds = get(cloudsShownStore);
const originalDisabled = get(tileAnimationsDisabledStore);
const rainStores = [rainAmountStore, rainLeanStore, rainSplashesStore, rainPuddlesStore, rainCloudsStore];
const originalRain = rainStores.map((store) => get(store));

afterEach(() => {
    for (const [name, value] of Object.entries(originalLights)) setLightSetting(name, value);
    weatherEffectsEnabledStore.set(originalEffects);
    cloudsShownStore.set(originalClouds);
    setTileAnimationsDisabled(originalDisabled);
    rainStores.forEach((store, index) => store.set(originalRain[index] ?? 0));
});

describe("graphics presets", () => {
    it("applies all four presets and recognises a manual change as custom", () => {
        for (const quality of GRAPHICS_PRESETS) {
            applyGraphicsQuality(quality);
            expect(get(graphicsQualityStore)).toBe(quality);
        }
        cloudsShownStore.set(false);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Custom);
        applyGraphicsQuality(GraphicsQuality.Ultra);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Ultra);
    });

    it("reduces expensive effects at low quality while keeping personal ambiance settings", () => {
        setLightSetting("nightDarkness", 0.6);
        setLightSetting("moonPhaseCurve", "linear");
        const before = readLightSettings();
        applyGraphicsQuality(GraphicsQuality.Low);
        expect(readLightSettings()).toMatchObject({
            nightDarkness: before.nightDarkness,
            moonPhaseCurve: before.moonPhaseCurve,
            shadowTrees: false,
            lightBounceOn: false,
            lightSecondBounceOn: false,
        });
        expect(get(weatherEffectsEnabledStore)).toBe(false);
        expect(get(tileAnimationsDisabledStore)).toBe(true);
        const high = graphicsProfile(GraphicsQuality.High);
        expect(high.lights).toMatchObject({
            shadowTreeShape: "realistic",
            lightBounceOn: true,
            lightSecondBounceOn: false,
        });
    });
});
