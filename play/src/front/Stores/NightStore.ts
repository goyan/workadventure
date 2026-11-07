import { get, writable, type Writable } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";

export enum NightMode {
    Server = "server",
    Computer = "computer",
    Disabled = "disabled",
}

const NIGHT_MODE_KEY = "nightMode";

/** Personal clock choice, preserving the old "turn off night" preference. */
function createNightModeStore(): Writable<NightMode> {
    const saved = localStorage.getItem(NIGHT_MODE_KEY);
    const initial =
        Object.values(NightMode).find((mode) => mode === saved) ??
        (localUserStore.getDisableNight() ? NightMode.Disabled : NightMode.Server);
    const store = writable(initial);
    const set = (value: NightMode): void => {
        localStorage.setItem(NIGHT_MODE_KEY, value);
        localUserStore.setDisableNight(value === NightMode.Disabled);
        store.set(value);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => {
            set(updater(get(store)));
        },
    };
}

export const nightModeStore = createNightModeStore();
