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

export interface GraphicsProfile {
    effects: boolean;
    clouds: boolean;
    animations: boolean;
    rain: readonly number[];
    lights: Readonly<Record<string, LightSettingValue>>;
}

/** Optional rendering effects only: choosing a quality never changes the map weather or the day/night clock. */
export function graphicsProfile(quality: GraphicsPreset): GraphicsProfile {
    const low = quality === GraphicsQuality.Low;
    const high = quality === GraphicsQuality.High || quality === GraphicsQuality.Ultra;
    const ultra = quality === GraphicsQuality.Ultra;
    return {
        effects: !low,
        clouds: high,
        animations: !low,
        rain: ultra ? [2, 2, 2, 2, 1] : high ? [1, 1, 1, 1, 0.8] : low ? [0.25, 0, 0, 0, 0] : [0.5, 0.5, 0.25, 0, 0.5],
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
            ambienceStrength: ultra ? 1 : 0.25,
            ambienceFullShare: ultra ? 0.05 : 0.3,
            lightSoftEdgeOn: high,
            lightSoftEdge: ultra ? 32 : 8,
            lightBounceOn: high,
            lightBounce: ultra ? 1 : 0.4,
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
    ],
    ([lights, effects, clouds, disabled, ...rain]) =>
        GRAPHICS_PRESETS.find((quality) => {
            const profile = graphicsProfile(quality);
            return (
                effects === profile.effects &&
                clouds === profile.clouds &&
                disabled === !profile.animations &&
                rain.every((value, index) => value === profile.rain[index]) &&
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
    setTileAnimationsDisabled(!profile.animations);
    [rainAmountStore, rainLeanStore, rainSplashesStore, rainPuddlesStore, rainCloudsStore].forEach((store, index) =>
        store.set(profile.rain[index] ?? 0),
    );
}
