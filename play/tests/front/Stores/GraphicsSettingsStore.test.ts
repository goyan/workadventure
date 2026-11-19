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
import { decodeLightSettings } from "../../../src/front/Stores/LightSettingsCode";
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

    // The light settings the Ultra quality was set from, as their owner shared them (2026-11-19).
    const ULTRA_CODE =
        "LUM1-eyJuaWdodERhcmtuZXNzIjowLjg1LCJuaWdodFJlYWxpc3RpYyI6dHJ1ZSwibm9BcmVhSGlnaGxpZ2h0Ijp0cnVlLCJhbWJpZW5jZVN0cmVuZ3RoIjowLCJhbWJpZW5jZUZ1bGxTaGFyZSI6MC44LCJsaWdodFNvZnRFZGdlIjoyLCJsaWdodEJvdW5jZSI6MC4zLCJhbWJpZW5jZU9uIjp0cnVlLCJsaWdodFNvZnRFZGdlT24iOnRydWUsImxpZ2h0Qm91bmNlT24iOnRydWUsImxpZ2h0UmVhbEZhbGxvZmYiOnRydWUsImxpZ2h0U2Vjb25kQm91bmNlT24iOnRydWUsInN1blNob3duIjp0cnVlLCJtb29uU2hvd24iOnRydWUsIm1vb25QaGFzZUN1cnZlIjoibGluZWFyIiwic3VuSW50ZW5zaXR5TWluIjowLjA1LCJzdW5JbnRlbnNpdHlNYXgiOjIsInN1bkNvbG9yTWluIjowLjM1LCJzdW5Db2xvck1heCI6Miwic3VuU2hhZG93TWluIjowLjc1LCJzdW5TaGFkb3dNYXgiOjgsIm1vb25JbnRlbnNpdHlNaW4iOjAuMTUsIm1vb25JbnRlbnNpdHlNYXgiOjIsIm1vb25Db2xvck1pbiI6MC4yLCJtb29uQ29sb3JNYXgiOjIsIm1vb25TaGFkb3dNaW4iOjAuNzUsIm1vb25TaGFkb3dNYXgiOjgsInNoYWRvd1dhbGxzIjp0cnVlLCJzaGFkb3dPYmplY3RzIjp0cnVlLCJzaGFkb3dUcmVlcyI6dHJ1ZSwic2hhZG93RGV0YWlscyI6dHJ1ZSwic2hhZG93QXZhdGFycyI6dHJ1ZSwic2hhZG93QW5pbWFscyI6dHJ1ZSwic2hhZG93VHJlZVNoYXBlIjoicmVhbGlzdGljIiwic2hhZG93QXZhdGFyU2hhcGUiOiJyZWFsaXN0aWMiLCJzaGFkb3dBbmltYWxTaGFwZSI6InJlYWxpc3RpYyIsInNoYWRvd0RldGFpbFNoYXBlIjoicmVhbGlzdGljIiwic2hhZG93VHJlZVN3YXkiOnRydWV9";

    it("sets every light setting of the Ultra quality as the shared code has it", () => {
        const shared = decodeLightSettings(ULTRA_CODE) ?? {};
        const ultra = graphicsProfile(GraphicsQuality.Ultra).lights;
        expect(ultra).toMatchObject({ nightDarkness: 0.85, ambienceStrength: 0, lightSoftEdge: 2, lightBounce: 0.3 });
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
});
