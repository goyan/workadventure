import { get, writable, type Writable } from "svelte/store";

/**
 * A personal number kept in the browser under `key`, from `min` to `max` (`fallback` until chosen, or when what is kept
 * is not a number). When the browser refuses the storage, the choice lasts until the page is closed.
 */
export function createPersistedNumberStore(key: string, fallback: number, min: number, max: number): Writable<number> {
    const clamp = (value: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(key);
    } catch {
        // Storage refused: the fallback is used.
    }
    const store = writable(stored === null ? fallback : clamp(Number(stored)));
    const set = (value: number): void => {
        const kept = clamp(value);
        try {
            localStorage.setItem(key, String(kept));
        } catch {
            // Storage refused: kept in memory only.
        }
        store.set(kept);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

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

/**
 * A personal choice among `choices`, kept in the browser under `key` (`fallback` until chosen, or when what is kept is
 * not one of them). When the browser refuses the storage, the choice lasts until the page is closed.
 */
export function createPersistedChoiceStore<T extends string>(
    key: string,
    choices: readonly T[],
    fallback: T,
): Writable<T> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(key);
    } catch {
        // Storage refused: the fallback is used.
    }
    const store = writable(choices.find((choice) => choice === stored) ?? fallback);
    const set = (choice: T): void => {
        try {
            localStorage.setItem(key, choice);
        } catch {
            // Storage refused: kept in memory only.
        }
        store.set(choice);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}
