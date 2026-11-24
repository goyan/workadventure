import { writable } from "svelte/store";

/** The grenade launcher is held (it exists only during a horde of zombies; put away when the horde ends). */
export const grenadeLauncherEquippedStore = writable(false);
