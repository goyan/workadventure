import { get, writable, type Writable } from "svelte/store";

const WEATHER_ENABLED_KEY = "weatherEffectsEnabled";

export enum GroundMode {
    Seasonal = "seasonal",
    Green = "green",
}

const GROUND_MODE_KEY = "groundMode";

function createGroundModeStore(): Writable<GroundMode> {
    const saved = localStorage.getItem(GROUND_MODE_KEY);
    const store = writable(Object.values(GroundMode).find((mode) => mode === saved) ?? GroundMode.Green);
    const set = (mode: GroundMode): void => {
        localStorage.setItem(GROUND_MODE_KEY, mode);
        store.set(mode);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const groundModeStore = createGroundModeStore();

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
