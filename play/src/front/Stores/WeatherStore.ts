import { get, writable, type Writable } from "svelte/store";
import { createPersistedNumberStore, createPersistedSwitchStore } from "./PersistedSwitchStore";

const WEATHER_ENABLED_KEY = "weatherEffectsEnabled";

function createWeatherEffectsStore(): Writable<boolean> {
    const store = writable(localStorage.getItem(WEATHER_ENABLED_KEY) !== "false");
    const set = (enabled: boolean): void => {
        localStorage.setItem(WEATHER_ENABLED_KEY, String(enabled));
        store.set(enabled);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const weatherEffectsEnabledStore = createWeatherEffectsStore();

/**
 * Personal switch for the clouds of the map weather and their shadows: on until turned off, kept in the browser. It
 * never changes the weather of the map for the others.
 */
export const cloudsShownStore = createPersistedSwitchStore("weatherCloudsShown", true);

/** Whether the clouds of a clear sky are drawn by the graphics card, gliding (Weather/CloudLayer), or in blocks. */
/** Whether this player sees the rainbows (rain under a low sun). Personal, kept in the browser. */
export const rainbowShownStore = createPersistedSwitchStore("weatherRainbowShown", true);

/** Whether the water reflects the sky, the clouds, the sun and the lamps. Personal, kept in the browser. */
export const waterReflectionsStore = createPersistedSwitchStore("waterReflections", true);

/** Where the rainbow shown on the map stands (the top of its arc, map pixels); undefined when there is none. */
export const rainbowSpotStore = writable<{ x: number; y: number } | undefined>(undefined);

export const smoothCloudsStore = createPersistedSwitchStore("weatherSmoothClouds", true);

/** Whether this player sees the animals of the water of the relief (fish, dolphins). Personal, kept in the browser. */
export const aquaticLifeShownStore = createPersistedSwitchStore("aquaticLifeShown", true);

/**
 * Personal height of the clouds, 0 to 1, kept in the browser: zooming in passes under them (they fade out, their
 * shadows stay on the ground); higher clouds need a closer zoom, and at 1 one never passes under them. 0 by default.
 */
export const cloudsHeightStore = createPersistedNumberStore("weatherCloudsHeight", 0, 0, 1);

/** The personal amount of rain and snow goes by steps of a slider: 1, 2, 4... up to 2 to the power of this step. */
export const RAIN_AMOUNT_LAST_STEP = 5;

/** The step of the slider (0 to RAIN_AMOUNT_LAST_STEP) of an amount: the nearest power of 2, 1 at the least. */
export function rainAmountStep(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 1) return 0;
    return Math.min(RAIN_AMOUNT_LAST_STEP, Math.round(Math.log2(amount)));
}

/** The amount of a step of the slider: 1, 2, 4, 8, 16, 32 times the usual rain. */
export function rainAmountOfStep(step: number): number {
    return 2 ** Math.min(RAIN_AMOUNT_LAST_STEP, Math.max(0, Math.round(step)));
}

/**
 * Personal settings of the rain, kept in the browser, 1 by default (the rain as designed); they never change the
 * weather of the map for the others. How many times more drops and flakes fall than the air says (1, 2, 4... 32: it
 * adds drops, it does not make the rain heavier; what an older version kept, from a quarter to 2, comes to the nearest
 * step, 1 at the least), how much they lean with the wind, how many splash on the ground, how big the puddles get (0:
 * none), and how much more it rains under the clouds than between them (0: the same everywhere).
 */
export const rainAmountStore = createPersistedNumberStore(
    "weatherRainAmount",
    1,
    1,
    rainAmountOfStep(RAIN_AMOUNT_LAST_STEP),
    (value) => rainAmountOfStep(rainAmountStep(value)),
);
/** The amount seen as the step of its slider (0 to RAIN_AMOUNT_LAST_STEP): setting it sets the amount of that step. */
export const rainAmountStepStore: Writable<number> = {
    subscribe: (run, invalidate) => rainAmountStore.subscribe((amount) => run(rainAmountStep(amount)), invalidate),
    set: (step) => rainAmountStore.set(rainAmountOfStep(step)),
    update: (updater) => rainAmountStore.set(rainAmountOfStep(updater(rainAmountStep(get(rainAmountStore))))),
};
export const rainLeanStore = createPersistedNumberStore("weatherRainLean", 1, 0, 2);
export const rainSplashesStore = createPersistedNumberStore("weatherRainSplashes", 1, 0, 2);
export const rainPuddlesStore = createPersistedNumberStore("weatherRainPuddles", 1, 0, 2);
export const rainCloudsStore = createPersistedNumberStore("weatherRainClouds", 1, 0, 1);

/**
 * Whether this player sees the rain and the snow in perspective, from a camera above the map (Weather/PerspectiveFall):
 * big and fast near the camera, finer down to the ground. Personal, kept in the browser, on by default.
 */
export const rainPerspectiveStore = createPersistedSwitchStore("weatherRainPerspective", true);
