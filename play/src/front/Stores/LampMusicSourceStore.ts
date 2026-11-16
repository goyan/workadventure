import { get, writable, type Writable } from "svelte/store";

export enum LampMusicSource {
    Rooms = "rooms",
    Personal = "personal",
}

const STORAGE_KEY = "lampMusicSource";

/** Personal preference: either the existing per-room Jams or the desktop's own music analysis. */
function createLampMusicSourceStore(): Writable<LampMusicSource> {
    const saved = localStorage.getItem(STORAGE_KEY);
    const store = writable(saved === LampMusicSource.Personal ? LampMusicSource.Personal : LampMusicSource.Rooms);
    const set = (source: LampMusicSource): void => {
        localStorage.setItem(STORAGE_KEY, source);
        store.set(source);
    };
    return { subscribe: store.subscribe, set, update: (updater): void => set(updater(get(store))) };
}

export const lampMusicSourceStore = createLampMusicSourceStore();
