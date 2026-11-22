import { writable } from "svelte/store";
import type { RgbLampLight } from "./RgbLampStore";

/** The warm light of the ice fishing shacks somebody sits in (their lantern, their stove): it pierces the night. */
export const iceShackLightsStore = writable<readonly RgbLampLight[]>([]);
