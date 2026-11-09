import { writable } from "svelte/store";

/** Personal switch for Jam lights; it never changes the music or another player's display. */
export const lampEffectsEnabledStore = writable(true);
