import { writable } from "svelte/store";

/**
 * The day and the night sped up, for this player alone (FastDayClock): whether it is on, and how fast, in minutes of
 * sky a second. Not kept: a page opened again shows the real sky.
 */
export const fastDayOnStore = writable(false);
export const fastDaySpeedStore = writable(3);

/** The instant of the sky shown while the day is sped up (NightManager); undefined otherwise. */
export const fastDaySkyStore = writable<Date | undefined>(undefined);
