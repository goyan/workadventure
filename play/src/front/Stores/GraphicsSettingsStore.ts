import { derived, get } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { MAX_SHADOW_TILES } from "../Phaser/Game/Night/SkyLight";
import { gameSceneStore } from "./GameSceneStore";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";
import { lightSettingsValuesStore, setLightSetting } from "./LightSettings";
import type { LightSettingValue } from "./LightSettingsCode";
import {
    cloudsShownStore,
    weatherEffectsEnabledStore,
    rainAmountStore,
    rainLeanStore,
    rainSplashesStore,
    rainPuddlesStore,
    rainCloudsStore,
    rainbowShownStore,
    smoothCloudsStore,
    waterReflectionsStore,
} from "./WeatherStore";

export enum GraphicsQuality {
    Low = "low",
    Medium = "medium",
    High = "high",
    Ultra = "ultra",
    Custom = "custom",
}
export type GraphicsPreset = Exclude<GraphicsQuality, GraphicsQuality.Custom>;
export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = [
    GraphicsQuality.Low,
    GraphicsQuality.Medium,
    GraphicsQuality.High,
    GraphicsQuality.Ultra,
];

/** The existing tile-animation preference, now shared by the page and desktop controls. */
export const tileAnimationsDisabledStore = createPersistedSwitchStore(
    "disableAnimations",
    localUserStore.getDisableAnimations(),
);

/** Smooth the borders of the game pixels when the canvas is stretched to the screen (Phaser/Services/SharpUpscale). */
export const pixelSmoothingStore = createPersistedSwitchStore("pixelSmoothing", true);

export interface GraphicsProfile {
    effects: boolean;
    clouds: boolean;
    /** The pixels smoothed when the game is stretched to the screen, the clouds by the graphics card, the rainbows. */
    pixelSmoothing: boolean;
    smoothClouds: boolean;
    rainbows: boolean;
    /** The sky, the clouds, the sun and the lamps mirrored by the water. */
    waterReflections: boolean;
    animations: boolean;
    rain: readonly number[];
    lights: Readonly<Record<string, LightSettingValue>>;
}

/**
 * Optional rendering effects only: choosing a quality never changes the map weather or the day/night clock.
 *
 * The lights of Ultra are the settings a player tuned on the team map and shared as a code (2026-11-19): a dark
 * night, no room-wide ambience, thin soft edges, a light bounce. The other qualities are derived from it: the same
 * doses, fewer effects turned on, a shorter reach for the sky.
 */
export function graphicsProfile(quality: GraphicsPreset): GraphicsProfile {
    const low = quality === GraphicsQuality.Low;
    const high = quality === GraphicsQuality.High || quality === GraphicsQuality.Ultra;
    const ultra = quality === GraphicsQuality.Ultra;
    return {
        effects: !low,
        clouds: high,
        pixelSmoothing: !low,
        smoothClouds: !low,
        rainbows: !low,
        waterReflections: !low,
        animations: !low,
        rain: ultra ? [2, 2, 2, 2, 1] : high ? [1, 1, 1, 1, 0.8] : low ? [1, 0, 0, 0, 0] : [1, 0.5, 0.25, 0, 0.5],
        lights: {
            sunShown: !low,
            moonShown: !low,
            shadowWalls: !low,
            shadowObjects: !low,
            shadowTrees: !low,
            shadowDetails: high,
            shadowAvatars: !low,
            shadowAnimals: high,
            shadowTreeShape: high ? "realistic" : "oval",
            shadowDetailShape: high ? "realistic" : "oval",
            shadowAvatarShape: high ? "realistic" : "oval",
            shadowAnimalShape: high ? "realistic" : "oval",
            shadowTreeSway: high,
            nightRealistic: high,
            lightRealFalloff: high,
            ambienceOn: !low,
            nightDarkness: 0.75,
            noAreaHighlight: true,
            moonPhaseCurve: "realistic",
            sunIntensityMin: 0.05,
            moonIntensityMin: 0.15,
            sunColorMin: 0.35,
            moonColorMin: 0.2,
            sunShadowMin: 0.75,
            moonShadowMin: 0.75,
            ambienceStrength: 0,
            ambienceFullShare: 1,
            lightSoftEdgeOn: high,
            lightSoftEdge: 2,
            lightBounceOn: high,
            lightBounce: 0.3,
            lightSecondBounceOn: ultra,
            sunIntensityMax: ultra ? 2 : 1,
            moonIntensityMax: ultra ? 2 : 1,
            sunColorMax: ultra ? 2 : 1,
            moonColorMax: ultra ? 2 : 1,
            sunShadowMax: ultra ? MAX_SHADOW_TILES : high ? 4 : 2,
            moonShadowMax: ultra ? MAX_SHADOW_TILES : high ? 4 : 2,
        },
    };
}

export const graphicsQualityStore = derived(
    [
        lightSettingsValuesStore,
        weatherEffectsEnabledStore,
        cloudsShownStore,
        tileAnimationsDisabledStore,
        rainAmountStore,
        rainLeanStore,
        rainSplashesStore,
        rainPuddlesStore,
        rainCloudsStore,
        pixelSmoothingStore,
        smoothCloudsStore,
        rainbowShownStore,
        waterReflectionsStore,
    ],
    ([
        lights,
        effects,
        clouds,
        disabled,
        rainAmount,
        rainLean,
        rainSplashes,
        rainPuddles,
        rainClouds,
        smoothing,
        smooth,
        rainbows,
        reflections,
    ]) =>
        GRAPHICS_PRESETS.find((quality) => {
            const profile = graphicsProfile(quality);
            return (
                effects === profile.effects &&
                clouds === profile.clouds &&
                disabled === !profile.animations &&
                smoothing === profile.pixelSmoothing &&
                smooth === profile.smoothClouds &&
                rainbows === profile.rainbows &&
                reflections === profile.waterReflections &&
                [rainAmount, rainLean, rainSplashes, rainPuddles, rainClouds].every(
                    (value, index) => value === profile.rain[index],
                ) &&
                Object.entries(profile.lights).every(([name, value]) => lights[name] === value)
            );
        }) ?? GraphicsQuality.Custom,
);

export function setTileAnimationsDisabled(disabled: boolean): void {
    tileAnimationsDisabledStore.set(disabled);
    localUserStore.setDisableAnimations(disabled);
    get(gameSceneStore)?.setTileAnimationsPaused(disabled);
}

export function applyGraphicsQuality(quality: GraphicsPreset): void {
    const profile = graphicsProfile(quality);
    for (const [name, value] of Object.entries(profile.lights)) setLightSetting(name, value);
    weatherEffectsEnabledStore.set(profile.effects);
    cloudsShownStore.set(profile.clouds);
    pixelSmoothingStore.set(profile.pixelSmoothing);
    smoothCloudsStore.set(profile.smoothClouds);
    rainbowShownStore.set(profile.rainbows);
    waterReflectionsStore.set(profile.waterReflections);
    setTileAnimationsDisabled(!profile.animations);
    [rainAmountStore, rainLeanStore, rainSplashesStore, rainPuddlesStore, rainCloudsStore].forEach((store, index) =>
        store.set(profile.rain[index] ?? 0),
    );
}
