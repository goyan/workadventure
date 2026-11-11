import { get, writable, type Writable } from "svelte/store";

const LAMP_EFFECTS_KEY = "lampEffectsEnabled";

/**
 * Personal switch for the lights of the lamps and the dance floors; it never changes the music or another player's
 * display. On until turned off, and kept in the browser: the Jam panel and the settings menu set the same choice.
 */
function createLampEffectsStore(): Writable<boolean> {
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(LAMP_EFFECTS_KEY);
    } catch {
        // Storage refused (private browsing): the choice lasts until the page is closed.
    }
    const store = writable(stored !== "false");
    const set = (enabled: boolean): void => {
        try {
            localStorage.setItem(LAMP_EFFECTS_KEY, String(enabled));
        } catch {
            // Same as above: kept in memory only.
        }
        store.set(enabled);
    };
    return {
        subscribe: store.subscribe,
        set,
        update: (updater): void => set(updater(get(store))),
    };
}

export const lampEffectsEnabledStore = createLampEffectsStore();

/**
 * The rooms (listening zones, in map pixels) whose lamps play for this user: their own light is put out, the night
 * veil no longer lights them, so that only the lights, in time with the music, are left.
 */
export const partyRoomsStore = writable<readonly { x: number; y: number; width: number; height: number }[]>([]);
