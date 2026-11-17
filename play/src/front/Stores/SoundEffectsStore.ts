import { derived, get, writable, type Writable } from "svelte/store";

const DEFAULT_VOLUME = 0.15;
// Apply the quieter baseline once, including browsers that saved the previous volume.
if (localStorage.getItem("soundEffectsVolumeBaseline") !== String(DEFAULT_VOLUME)) {
    localStorage.setItem("footstepVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("environmentVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("soundEffectsVolumeBaseline", String(DEFAULT_VOLUME));
}

/**
 * Whether the sounds of the game are cut: the player stands in a silent zone (a Teams meeting room is one). The volumes
 * below then read 0, whatever their setting; they come back on leaving.
 */
export const soundEffectsSilencedStore = writable(false);

/**
 * The volume a family of sounds is heard at. `setting` is what the player chose, for the settings: it does not change
 * in a silent zone.
 */
export type VolumeStore = Writable<number> & { setting: Writable<number> };

/**
 * A personal volume saved in this browser. `formerKey`: the setting it was split from, whose value it starts with, so
 * that splitting a slider changes nothing that anyone hears. `silenceable`: cut in a silent zone.
 */
function createVolumeStore(key: string, defaultVolume: number, formerKey?: string, silenceable = true): VolumeStore {
    const saved = localStorage.getItem(key) ?? (formerKey === undefined ? null : localStorage.getItem(formerKey));
    const initial = saved === null ? defaultVolume : Number(saved);
    const clamp = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : defaultVolume);
    const store = writable(clamp(initial));
    const set = (value: number): void => {
        const volume = clamp(value);
        localStorage.setItem(key, String(volume));
        store.set(volume);
    };
    const update = (updater: (value: number) => number): void => set(updater(get(store)));
    const heard = silenceable
        ? derived([store, soundEffectsSilencedStore], ([$volume, $silenced]) => ($silenced ? 0 : $volume))
        : store;
    return { subscribe: heard.subscribe, set, update, setting: { subscribe: store.subscribe, set, update } };
}

// One volume per family of sounds (Settings > Sounds). "environmentVolume" was the single slider of the last
// five: they start from it.
export const footstepVolumeStore = createVolumeStore("footstepVolume", DEFAULT_VOLUME);
export const skateboardVolumeStore = createVolumeStore("skateboardVolume", DEFAULT_VOLUME, "footstepVolume");
export const weatherVolumeStore = createVolumeStore("weatherVolume", DEFAULT_VOLUME, "environmentVolume");
export const doorVolumeStore = createVolumeStore("doorVolume", DEFAULT_VOLUME, "environmentVolume");
/** Foam-blaster pops, heard from the local player and nearby colleagues. */
export const nerfVolumeStore = createVolumeStore("nerfVolume", DEFAULT_VOLUME, "environmentVolume");
/** Calls of the jungle animals, heard near them. */
export const jungleVolumeStore = createVolumeStore("jungleVolume", DEFAULT_VOLUME, "environmentVolume");
/** The audio zones placed on the map with the editor. */
export const mapSoundsVolumeStore = createVolumeStore("mapSoundsVolume", DEFAULT_VOLUME, "environmentVolume");
/** New message, wave, entering a bubble, meeting, knock on a door. Not cut in a silent zone. */
export const notificationSoundVolumeStore = createVolumeStore(
    "notificationSoundVolume",
    DEFAULT_VOLUME,
    "environmentVolume",
    // What calls the player is still heard in a silent zone.
    false,
);
