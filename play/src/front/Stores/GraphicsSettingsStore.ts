import { derived, get } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";
import { MAX_SHADOW_TILES } from "../Phaser/Game/Night/SkyLight";
import { gameSceneStore } from "./GameSceneStore";
import { EFFECTS, effectShownStores } from "./EffectsStore";
import { jungleEnabledStore } from "./JungleStore";
import { lampEffectsEnabledStore } from "./LampEffectsStore";
import { NightMode, nightModeStore } from "./NightStore";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";
import { lightSettingsValuesStore, setLightSetting } from "./LightSettings";
import type { LightSettingValue } from "./LightSettingsCode";
import {
    aquaticLifeShownStore,
    cloudsShownStore,
    weatherEffectsEnabledStore,
    rainAmountStore,
    rainLeanStore,
    rainSplashesStore,
    rainPuddlesStore,
    rainCloudsStore,
} from "./WeatherStore";

export enum GraphicsQuality {
    /** A plain office, for this person only: no effect, no animal, no animation, no night. */
    None = "none",
    Low = "low",
    Medium = "medium",
    High = "high",
    Ultra = "ultra",
    Custom = "custom",
}
export type GraphicsPreset = Exclude<GraphicsQuality, GraphicsQuality.Custom>;
export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = [
    GraphicsQuality.None,
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
    /**
     * The effects without a switch of their own (EffectsStore), the animals, the lamp effects: all on but for a plain
     * office (None), which also turns the night off.
     */
    lively: boolean;
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
    const none = quality === GraphicsQuality.None;
    const low = quality === GraphicsQuality.Low || none;
    const high = quality === GraphicsQuality.High || quality === GraphicsQuality.Ultra;
    const ultra = quality === GraphicsQuality.Ultra;
    return {
        effects: !low,
        clouds: high,
        animations: !low,
        lively: !none,
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

/** All the lively things (see GraphicsProfile.lively): "on", "off", or "mixed" when some are and some are not. */
function livelySwitches() {
    return [
        ...EFFECTS.map((name) => effectShownStores[name]),
        jungleEnabledStore,
        aquaticLifeShownStore,
        lampEffectsEnabledStore,
    ];
}

const livelyStore = derived([...livelySwitches(), nightModeStore], (values) => {
    const night = values[values.length - 1];
    const switches = values.slice(0, -1);
    if (switches.every((on) => on === true)) return "on";
    return switches.every((on) => on === false) && night === NightMode.Disabled ? "off" : "mixed";
});

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
        livelyStore,
    ],
    ([lights, effects, clouds, disabled, rainAmount, rainLean, rainSplashes, rainPuddles, rainClouds, lively]) =>
        GRAPHICS_PRESETS.find((quality) => {
            const profile = graphicsProfile(quality);
            const rain = [rainAmount, rainLean, rainSplashes, rainPuddles, rainClouds];
            return (
                lively === (profile.lively ? "on" : "off") &&
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
    for (const store of livelySwitches()) store.set(profile.lively);
    if (!profile.lively) nightModeStore.set(NightMode.Disabled);
    [rainAmountStore, rainLeanStore, rainSplashesStore, rainPuddlesStore, rainCloudsStore].forEach((store, index) =>
        store.set(profile.rain[index] ?? 0),
    );
}
