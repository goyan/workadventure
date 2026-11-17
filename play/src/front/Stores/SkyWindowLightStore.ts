import { writable } from "svelte/store";
import type { RgbLampLight } from "./RgbLampStore";

/**
 * The moonlight that comes in through the windows, as it is drawn (SkyWindowLightManager): the night veil is pierced
 * with it, a little, as with the lights of the lamps. Empty by day: the sun needs no hole in the veil.
 */
export const skyWindowLightsStore = writable<readonly RgbLampLight[]>([]);
