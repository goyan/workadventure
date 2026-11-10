import { get, writable, type Writable } from "svelte/store";

const DEFAULT_VOLUME = 0.15;
// Apply the quieter baseline once, including browsers that saved the previous volume.
if (localStorage.getItem("soundEffectsVolumeBaseline") !== String(DEFAULT_VOLUME)) {
    localStorage.setItem("footstepVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("environmentVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("soundEffectsVolumeBaseline", String(DEFAULT_VOLUME));
}

/**
 * A personal volume saved in this browser. `formerKey`: the setting it was split from, whose value it starts with, so
 * that splitting a slider changes nothing that anyone hears.
 */
function createVolumeStore(key: string, defaultVolume: number, formerKey?: string): Writable<number> {
    const saved = localStorage.getItem(key) ?? (formerKey === undefined ? null : localStorage.getItem(formerKey));
    const initial = saved === null ? defaultVolume : Number(saved);
    const clamp = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : defaultVolume);
    const store = writable(clamp(initial));
    const set = (value: number): void => {
        const volume = clamp(value);
        localStorage.setItem(key, String(volume));
        store.set(volume);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

// One volume per family of sounds (Settings > Sounds). "environmentVolume" was the single slider of the last
// five: they start from it.
export const footstepVolumeStore = createVolumeStore("footstepVolume", DEFAULT_VOLUME);
export const skateboardVolumeStore = createVolumeStore("skateboardVolume", DEFAULT_VOLUME, "footstepVolume");
export const weatherVolumeStore = createVolumeStore("weatherVolume", DEFAULT_VOLUME, "environmentVolume");
export const doorVolumeStore = createVolumeStore("doorVolume", DEFAULT_VOLUME, "environmentVolume");
/** The audio zones placed on the map with the editor. */
export const mapSoundsVolumeStore = createVolumeStore("mapSoundsVolume", DEFAULT_VOLUME, "environmentVolume");
/** New message, wave, entering a bubble, meeting, knock on a door. */
export const notificationSoundVolumeStore = createVolumeStore(
    "notificationSoundVolume",
    DEFAULT_VOLUME,
    "environmentVolume",
);
