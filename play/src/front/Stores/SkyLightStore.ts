import { derived } from "svelte/store";
import type { Readable } from "svelte/store";
import { DEFAULT_SHADOW_TILES, MAX_SHADOW_TILES } from "../Phaser/Game/Night/SkyLight";
import type { BodyLightSettings, MoonPhaseCurve, SkyLightSettings } from "../Phaser/Game/Night/SkyLight";
import type { ShadowShape } from "../Phaser/Game/SkyShadows/SkyShadowPicture";
import {
    createPersistedChoiceStore,
    createPersistedNumberStore,
    createPersistedSwitchStore,
} from "./PersistedSwitchStore";

/**
 * Personal settings of the light of the sun and of the moon (shadows outdoors, light through the windows, moonlight on
 * the night veil), kept in the browser. They never change anything for the others.
 */
export const sunLightShownStore = createPersistedSwitchStore("skySunLightShown", true);
export const moonLightShownStore = createPersistedSwitchStore("skyMoonLightShown", true);
export const MOON_PHASE_CURVES: readonly MoonPhaseCurve[] = ["linear", "realistic"];
export const moonPhaseCurveStore = createPersistedChoiceStore<MoonPhaseCurve>(
    "skyMoonPhaseCurve",
    MOON_PHASE_CURVES,
    "realistic",
);

/**
 * The limits of the light of a body, each a slider: intensity and colour in shares of what the body gives at its
 * strongest (minimum 0 to 100 %, maximum 0 to 200 %), shadow length in tiles (minimum 0 to 2, maximum 1 to 8).
 */
function bodyLimits(prefix: string) {
    return {
        intensityMin: createPersistedNumberStore(`${prefix}IntensityMin`, 0, 0, 1),
        intensityMax: createPersistedNumberStore(`${prefix}IntensityMax`, 1, 0, 2),
        colorMin: createPersistedNumberStore(`${prefix}ColorMin`, 0, 0, 1),
        colorMax: createPersistedNumberStore(`${prefix}ColorMax`, 1, 0, 2),
        shadowMin: createPersistedNumberStore(`${prefix}ShadowMin`, 0, 0, 2),
        shadowMax: createPersistedNumberStore(`${prefix}ShadowMax`, DEFAULT_SHADOW_TILES, 1, MAX_SHADOW_TILES),
    };
}

export const sunLightLimits = bodyLimits("skySun");
export const moonLightLimits = bodyLimits("skyMoon");

function bodySettings(shown: Readable<boolean>, limits: ReturnType<typeof bodyLimits>): Readable<BodyLightSettings> {
    return derived(
        [
            shown,
            limits.intensityMin,
            limits.intensityMax,
            limits.colorMin,
            limits.colorMax,
            limits.shadowMin,
            limits.shadowMax,
        ],
        ([enabled, intensityMin, intensityMax, colorMin, colorMax, shadowMin, shadowMax]) => ({
            enabled,
            intensity: { min: intensityMin, max: intensityMax },
            color: { min: colorMin, max: colorMax },
            shadowLength: { min: shadowMin, max: shadowMax },
        }),
    );
}

/** All the settings of the light of the sky, as skyLightAt takes them. */
export const skyLightSettingsStore: Readable<SkyLightSettings> = derived(
    [
        bodySettings(sunLightShownStore, sunLightLimits),
        bodySettings(moonLightShownStore, moonLightLimits),
        moonPhaseCurveStore,
    ],
    ([sun, moon, phaseCurve]) => ({ sun, moon: { ...moon, phaseCurve } }),
);

/**
 * What throws a shadow of the sky, by kind, each turned off by this person at will (for the sun and for the moon).
 */
export const skyShadowCategoryStores = {
    walls: createPersistedSwitchStore("skyShadowWalls", true),
    objects: createPersistedSwitchStore("skyShadowObjects", true),
    trees: createPersistedSwitchStore("skyShadowTrees", true),
    details: createPersistedSwitchStore("skyShadowDetails", true),
    avatars: createPersistedSwitchStore("skyShadowAvatars", true),
    animals: createPersistedSwitchStore("skyShadowAnimals", true),
};

/**
 * How the shadow of each kind that can have its true silhouette is drawn: a plain oval or that silhouette. To compare
 * how they look and what they cost.
 */
export const SHADOW_SHAPES: readonly ShadowShape[] = ["oval", "realistic"];
export const skyShadowShapeStores = {
    trees: createPersistedChoiceStore<ShadowShape>("skyShadowTreeShape", SHADOW_SHAPES, "oval"),
    avatars: createPersistedChoiceStore<ShadowShape>("skyShadowAvatarShape", SHADOW_SHAPES, "realistic"),
    animals: createPersistedChoiceStore<ShadowShape>("skyShadowAnimalShape", SHADOW_SHAPES, "oval"),
    details: createPersistedChoiceStore<ShadowShape>("skyShadowDetailShape", SHADOW_SHAPES, "oval"),
};
/** Whether the shadows of the trees sway with them in the wind (drawn again at each of their poses). */
export const skyShadowTreeSwayStore = createPersistedSwitchStore("skyShadowTreeSway", true);

export interface SkyShadowCategories {
    walls: boolean;
    objects: boolean;
    trees: boolean;
    details: boolean;
    avatars: boolean;
    animals: boolean;
    treeShape: ShadowShape;
    avatarShape: ShadowShape;
    animalShape: ShadowShape;
    detailShape: ShadowShape;
    treeSway: boolean;
}

export const skyShadowCategoriesStore: Readable<SkyShadowCategories> = derived(
    [
        skyShadowCategoryStores.walls,
        skyShadowCategoryStores.objects,
        skyShadowCategoryStores.trees,
        skyShadowCategoryStores.details,
        skyShadowCategoryStores.avatars,
        skyShadowCategoryStores.animals,
        skyShadowShapeStores.trees,
        skyShadowShapeStores.avatars,
        skyShadowShapeStores.animals,
        skyShadowShapeStores.details,
        skyShadowTreeSwayStore,
    ],
    ([
        walls,
        objects,
        trees,
        details,
        avatars,
        animals,
        treeShape,
        avatarShape,
        animalShape,
        detailShape,
        treeSway,
    ]) => ({
        walls,
        objects,
        trees,
        details,
        avatars,
        animals,
        treeShape,
        avatarShape,
        animalShape,
        detailShape,
        treeSway,
    }),
);
