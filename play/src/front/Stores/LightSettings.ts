import { get, type Writable } from "svelte/store";
import {
    acceptedLightSettings,
    decodeLightSettings,
    encodeLightSettings,
    type LightSettingKind,
    type LightSettingValue,
} from "./LightSettingsCode";
import {
    ambienceFullShareStore,
    ambienceOnStore,
    ambienceStrengthStore,
    bounceOnStore,
    lightBounceStore,
    lightSoftEdgeStore,
    nightDarknessStore,
    noAreaHighlightStore,
    realFalloffStore,
    realisticNightStore,
    secondBounceOnStore,
    softEdgeOnStore,
} from "./NightStore";
import {
    MOON_PHASE_CURVES,
    SHADOW_SHAPES,
    moonLightLimits,
    moonLightShownStore,
    moonPhaseCurveStore,
    skyShadowCategoryStores,
    skyShadowShapeStores,
    skyShadowTreeSwayStore,
    sunLightLimits,
    sunLightShownStore,
} from "./SkyLightStore";

type Setting = LightSettingKind & { set(value: LightSettingValue): void; read(): LightSettingValue };

const number = (store: Writable<number>): Setting => ({
    kind: "number",
    read: () => get(store),
    set: (value) => typeof value === "number" && store.set(value),
});
const onOff = (store: Writable<boolean>): Setting => ({
    kind: "switch",
    read: () => get(store),
    set: (value) => typeof value === "boolean" && store.set(value),
});
const choice = <T extends string>(store: Writable<T>, choices: readonly T[]): Setting => ({
    kind: "choice",
    choices,
    read: () => get(store),
    set: (value) => {
        const chosen = choices.find((candidate) => candidate === value);
        if (chosen !== undefined) store.set(chosen);
    },
});
const limits = (prefix: string, stores: typeof sunLightLimits): Record<string, Setting> => ({
    [`${prefix}IntensityMin`]: number(stores.intensityMin),
    [`${prefix}IntensityMax`]: number(stores.intensityMax),
    [`${prefix}ColorMin`]: number(stores.colorMin),
    [`${prefix}ColorMax`]: number(stores.colorMax),
    [`${prefix}ShadowMin`]: number(stores.shadowMin),
    [`${prefix}ShadowMax`]: number(stores.shadowMax),
});

/**
 * Every personal setting of the light of the map: the night (how dark, bounced light, soft edges, realistic lighting),
 * the sun and the moon, and what throws a shadow. Their names are part of the code players hand each other: a name is
 * never given another meaning, and a new setting gets a new name.
 */
const LIGHT_SETTINGS: Readonly<Record<string, Setting>> = {
    nightDarkness: number(nightDarknessStore),
    nightRealistic: onOff(realisticNightStore),
    noAreaHighlight: onOff(noAreaHighlightStore),
    ambienceStrength: number(ambienceStrengthStore),
    ambienceFullShare: number(ambienceFullShareStore),
    lightSoftEdge: number(lightSoftEdgeStore),
    lightBounce: number(lightBounceStore),
    ambienceOn: onOff(ambienceOnStore),
    lightSoftEdgeOn: onOff(softEdgeOnStore),
    lightBounceOn: onOff(bounceOnStore),
    lightRealFalloff: onOff(realFalloffStore),
    lightSecondBounceOn: onOff(secondBounceOnStore),
    sunShown: onOff(sunLightShownStore),
    moonShown: onOff(moonLightShownStore),
    moonPhaseCurve: choice(moonPhaseCurveStore, MOON_PHASE_CURVES),
    ...limits("sun", sunLightLimits),
    ...limits("moon", moonLightLimits),
    shadowWalls: onOff(skyShadowCategoryStores.walls),
    shadowObjects: onOff(skyShadowCategoryStores.objects),
    shadowTrees: onOff(skyShadowCategoryStores.trees),
    shadowDetails: onOff(skyShadowCategoryStores.details),
    shadowAvatars: onOff(skyShadowCategoryStores.avatars),
    shadowAnimals: onOff(skyShadowCategoryStores.animals),
    shadowTreeShape: choice(skyShadowShapeStores.trees, SHADOW_SHAPES),
    shadowAvatarShape: choice(skyShadowShapeStores.avatars, SHADOW_SHAPES),
    shadowAnimalShape: choice(skyShadowShapeStores.animals, SHADOW_SHAPES),
    shadowDetailShape: choice(skyShadowShapeStores.details, SHADOW_SHAPES),
    shadowTreeSway: onOff(skyShadowTreeSwayStore),
};

/** The code of all the light settings of this player, as they are now. */
export function currentLightSettingsCode(): string {
    return encodeLightSettings(
        Object.fromEntries(Object.entries(LIGHT_SETTINGS).map(([name, setting]) => [name, setting.read()])),
    );
}

/**
 * Applies the light settings of a code somebody handed over. Returns how many were applied, or undefined when this is
 * not such a code. Each setting keeps its own limits (see the stores).
 */
export function applyLightSettingsCode(code: string): number | undefined {
    const decoded = decodeLightSettings(code);
    if (decoded === undefined) {
        return undefined;
    }
    const accepted = Object.entries(acceptedLightSettings(decoded, LIGHT_SETTINGS));
    for (const [name, value] of accepted) {
        LIGHT_SETTINGS[name]?.set(value);
    }
    return accepted.length;
}
