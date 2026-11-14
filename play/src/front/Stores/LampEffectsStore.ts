import { writable } from "svelte/store";
import { createPersistedSwitchStore } from "./PersistedSwitchStore";

/**
 * Personal switch for the lights of the lamps and the dance floors; it never changes the music or another player's
 * display. On until turned off, and kept in the browser: the Jam panel and the settings menu set the same choice.
 */
export const lampEffectsEnabledStore = createPersistedSwitchStore("lampEffectsEnabled", true);

/**
 * The rooms (listening zones, in map pixels) whose lamps play for this user: their own light is put out, the night
 * veil no longer lights them, so that only the lights, in time with the music, are left.
 */
export const partyRoomsStore = writable<readonly { x: number; y: number; width: number; height: number }[]>([]);
