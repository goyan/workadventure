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
    pixelSmoothingStore,
    setTileAnimationsDisabled,
    tileAnimationsDisabledStore,
} from "../../../src/front/Stores/GraphicsSettingsStore";
import { readLightSettings, setLightSetting } from "../../../src/front/Stores/LightSettings";
import { decodeLightSettings } from "../../../src/front/Stores/LightSettingsCode";
import {
    cloudsShownStore,
    weatherEffectsEnabledStore,
    rainAmountOfStep,
    rainAmountStep,
    rainAmountStore,
    rainLeanStore,
    rainSplashesStore,
    rainPuddlesStore,
    rainCloudsStore,
    rainbowShownStore,
    smoothCloudsStore,
    waterReflectionsStore,
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

    // The light settings the Ultra quality was set from, as their owner shared them (2026-11-19).
    const ULTRA_CODE =
        "LUM1-eyJuaWdodERhcmtuZXNzIjowLjc1LCJuaWdodFJlYWxpc3RpYyI6dHJ1ZSwibm9BcmVhSGlnaGxpZ2h0Ijp0cnVlLCJhbWJpZW5jZVN0cmVuZ3RoIjowLCJhbWJpZW5jZUZ1bGxTaGFyZSI6MSwibGlnaHRTb2Z0RWRnZSI6MiwibGlnaHRCb3VuY2UiOjAuMywiYW1iaWVuY2VPbiI6dHJ1ZSwibGlnaHRTb2Z0RWRnZU9uIjp0cnVlLCJsaWdodEJvdW5jZU9uIjp0cnVlLCJsaWdodFJlYWxGYWxsb2ZmIjp0cnVlLCJsaWdodFNlY29uZEJvdW5jZU9uIjp0cnVlLCJzdW5TaG93biI6dHJ1ZSwibW9vblNob3duIjp0cnVlLCJtb29uUGhhc2VDdXJ2ZSI6InJlYWxpc3RpYyIsInN1bkludGVuc2l0eU1pbiI6MC4wNSwic3VuSW50ZW5zaXR5TWF4IjoyLCJzdW5Db2xvck1pbiI6MC4zNSwic3VuQ29sb3JNYXgiOjIsInN1blNoYWRvd01pbiI6MC43NSwic3VuU2hhZG93TWF4Ijo4LCJtb29uSW50ZW5zaXR5TWluIjowLjE1LCJtb29uSW50ZW5zaXR5TWF4IjoyLCJtb29uQ29sb3JNaW4iOjAuMiwibW9vbkNvbG9yTWF4IjoyLCJtb29uU2hhZG93TWluIjowLjc1LCJtb29uU2hhZG93TWF4Ijo4LCJzaGFkb3dXYWxscyI6dHJ1ZSwic2hhZG93T2JqZWN0cyI6dHJ1ZSwic2hhZG93VHJlZXMiOnRydWUsInNoYWRvd0RldGFpbHMiOnRydWUsInNoYWRvd0F2YXRhcnMiOnRydWUsInNoYWRvd0FuaW1hbHMiOnRydWUsInNoYWRvd1RyZWVTaGFwZSI6InJlYWxpc3RpYyIsInNoYWRvd0F2YXRhclNoYXBlIjoicmVhbGlzdGljIiwic2hhZG93QW5pbWFsU2hhcGUiOiJyZWFsaXN0aWMiLCJzaGFkb3dEZXRhaWxTaGFwZSI6InJlYWxpc3RpYyIsInNoYWRvd1RyZWVTd2F5Ijp0cnVlfQ";

    it("sets every light setting of the Ultra quality as the shared code has it", () => {
        const shared = decodeLightSettings(ULTRA_CODE) ?? {};
        const ultra = graphicsProfile(GraphicsQuality.Ultra).lights;
        expect(ultra).toMatchObject({ nightDarkness: 0.75, ambienceStrength: 0, lightSoftEdge: 2, lightBounce: 0.3 });
        for (const [name, value] of Object.entries(ultra)) expect([name, value]).toEqual([name, shared[name]]);
        expect(Object.keys(ultra).sort()).toEqual(Object.keys(shared).sort());
        applyGraphicsQuality(GraphicsQuality.Ultra);
        expect(readLightSettings()).toMatchObject(shared);
    });

    const DOSES = [
        "nightDarkness",
        "ambienceStrength",
        "ambienceFullShare",
        "lightSoftEdge",
        "lightBounce",
        "moonPhaseCurve",
        "sunIntensityMin",
        "moonIntensityMin",
        "sunColorMin",
        "moonColorMin",
        "sunShadowMin",
        "moonShadowMin",
    ];

    it("derives the other qualities from Ultra: the same doses, fewer effects", () => {
        const ultra = graphicsProfile(GraphicsQuality.Ultra).lights;
        for (const quality of GRAPHICS_PRESETS) {
            const { lights } = graphicsProfile(quality);
            for (const dose of DOSES) {
                expect([quality, dose, lights[dose]]).toEqual([quality, dose, ultra[dose]]);
            }
        }
        expect(graphicsProfile(GraphicsQuality.High).lights).toMatchObject({
            lightBounceOn: true,
            lightSecondBounceOn: false,
            sunIntensityMax: 1,
            moonShadowMax: 4,
        });
        expect(graphicsProfile(GraphicsQuality.Medium).lights).toMatchObject({
            lightBounceOn: false,
            ambienceOn: true,
        });
        expect(graphicsProfile(GraphicsQuality.Low).lights).toMatchObject({ ambienceOn: false, sunShown: false });
    });

    it("reduces expensive effects at low quality", () => {
        applyGraphicsQuality(GraphicsQuality.Low);
        expect(readLightSettings()).toMatchObject({
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

    it("sets the amount of rain and snow to a step of its slider in every quality, ×1 at low quality", () => {
        for (const quality of GRAPHICS_PRESETS) {
            const amount = graphicsProfile(quality).rain[0];
            expect(amount, quality).toBeGreaterThanOrEqual(1);
            expect(rainAmountOfStep(rainAmountStep(amount)), quality).toBe(amount);
        }
        expect(graphicsProfile(GraphicsQuality.Low).rain[0]).toBe(1);
        applyGraphicsQuality(GraphicsQuality.Ultra);
        expect(get(rainAmountStore)).toBe(graphicsProfile(GraphicsQuality.Ultra).rain[0]);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Ultra);
    });

    it("turns the smoothed pixels, the gliding clouds, the rainbows and the reflections off at low quality only", () => {
        applyGraphicsQuality(GraphicsQuality.Low);
        expect([get(pixelSmoothingStore), get(smoothCloudsStore), get(rainbowShownStore)]).toEqual([
            false,
            false,
            false,
        ]);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Low);
        applyGraphicsQuality(GraphicsQuality.Medium);
        expect([
            get(pixelSmoothingStore),
            get(smoothCloudsStore),
            get(rainbowShownStore),
            get(waterReflectionsStore),
        ]).toEqual([true, true, true, true]);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Medium);
        // Changed by hand, the quality is a custom one.
        rainbowShownStore.set(false);
        expect(get(graphicsQualityStore)).toBe(GraphicsQuality.Custom);
    });
});
