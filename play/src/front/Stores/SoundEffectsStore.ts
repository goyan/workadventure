import { get, writable, type Writable } from "svelte/store";

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

export const footstepVolumeStore = createVolumeStore("footstepVolume", 0.5);
export const environmentVolumeStore = createVolumeStore("environmentVolume", 0.5);
