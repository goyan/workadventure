import { get, writable, type Writable } from "svelte/store";

const FAST_STROBES_KEY = "fastStrobesEnabled";

/**
 * Whether this player agrees to see strobe lamps flash faster than 3 times a second (photosensitivity: flashing
 * between about 3 and 30 times a second is what can trigger a seizure). Off until they turn it on, kept in the browser
 * like the other personal choices.
 */
function createFastStrobesStore(): Writable<boolean> {
    const store = writable(localStorage.getItem(FAST_STROBES_KEY) === "true");
    const set = (enabled: boolean): void => {
        localStorage.setItem(FAST_STROBES_KEY, String(enabled));
        store.set(enabled);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const fastStrobesEnabledStore = createFastStrobesStore();
