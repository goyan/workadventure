import { writable } from "svelte/store";
import type { RgbLampLight } from "./RgbLampStore";

/** Session equipment, kept through a reconnect but reset when leaving the scene (like the Nerf). */
export const torchEquippedStore = writable(false);

/**
 * The lights of the torches, as they are drawn: the night veil is pierced with the same shapes, next to those of the
 * RGB lamps (each has its own writer).
 */
export const torchLightsStore = writable<readonly RgbLampLight[]>([]);
