import { get, writable, type Writable } from "svelte/store";

const DEFAULT_VOLUME = 0.15;
// Apply the quieter baseline once, including browsers that saved the previous volume.
if (localStorage.getItem("soundEffectsVolumeBaseline") !== String(DEFAULT_VOLUME)) {
    localStorage.setItem("footstepVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("environmentVolume", String(DEFAULT_VOLUME));
    localStorage.setItem("soundEffectsVolumeBaseline", String(DEFAULT_VOLUME));
}

function createVolumeStore(key: string, defaultVolume: number): Writable<number> {
    const saved = localStorage.getItem(key);
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

export const footstepVolumeStore = createVolumeStore("footstepVolume", DEFAULT_VOLUME);
export const environmentVolumeStore = createVolumeStore("environmentVolume", DEFAULT_VOLUME);
