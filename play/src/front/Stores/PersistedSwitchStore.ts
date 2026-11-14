import { get, writable, type Writable } from "svelte/store";

/**
 * A personal on/off choice kept in the browser under `key` (`defaultOn` until chosen). When the browser refuses the
 * storage (private browsing), the choice lasts until the page is closed.
 */
export function createPersistedSwitchStore(key: string, defaultOn: boolean): Writable<boolean> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(key);
    } catch {
        // Storage refused: the default is used.
    }
    const store = writable(stored === null ? defaultOn : stored === "true");
    const set = (on: boolean): void => {
        try {
            localStorage.setItem(key, String(on));
        } catch {
            // Storage refused: kept in memory only.
        }
        store.set(on);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}
