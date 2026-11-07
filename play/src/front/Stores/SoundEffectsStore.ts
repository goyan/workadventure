import { get, writable, type Writable } from "svelte/store";

function createVolumeStore(key: string): Writable<number> {
    const saved = localStorage.getItem(key);
    const initial = saved === null ? 1 : Number(saved);
    const clamp = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1);
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

export const footstepVolumeStore = createVolumeStore("footstepVolume");
export const environmentVolumeStore = createVolumeStore("environmentVolume");
