import { get, writable, type Writable } from "svelte/store";

const LAMP_DEMO_KEY = "lampDemoEnabled";

/**
 * Whether the demo lamps are shown near the player, lit by a made-up beat, to see how lamps look without a Jam.
 * A personal setting, off until turned on: kept in the browser, where the installed app and a browser tab of the same
 * profile find it, since the app has no address bar to put `?lampDemo` in.
 */
function createLampDemoStore(): Writable<boolean> {
    const store = writable(localStorage.getItem(LAMP_DEMO_KEY) === "true");
    const set = (enabled: boolean): void => {
        localStorage.setItem(LAMP_DEMO_KEY, String(enabled));
        store.set(enabled);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const lampDemoEnabledStore = createLampDemoStore();
