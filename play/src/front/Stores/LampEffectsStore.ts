import { writable } from "svelte/store";

/** Personal switch for Jam lights; it never changes the music or another player's display. */
export const lampEffectsEnabledStore = writable(true);

/**
 * The rooms (listening zones, in map pixels) whose lamps play for this user: their own light is put out, the night
 * veil no longer lights them, so that only the lights, in time with the music, are left.
 */
export const partyRoomsStore = writable<readonly { x: number; y: number; width: number; height: number }[]>([]);
