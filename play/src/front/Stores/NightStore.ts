import { writable, type Writable } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";

/**
 * Personal "turn off night" setting. Initialised from the browser storage and
 * written back on every change, so the choice survives reloads.
 */
function createNightDisabledStore(): Writable<boolean> {
    const store = writable<boolean>(localUserStore.getDisableNight());

    const set = (value: boolean): void => {
        localUserStore.setDisableNight(value);
        store.set(value);
    };

    return {
        subscribe: store.subscribe,
        set,
        update: (updater) => {
            let next = false;
            store.update((current) => (next = updater(current)));
            localUserStore.setDisableNight(next);
        },
    };
}

export const nightDisabledStore = createNightDisabledStore();
