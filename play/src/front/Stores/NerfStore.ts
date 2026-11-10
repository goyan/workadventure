import { writable } from "svelte/store";

/** Session equipment, kept through a reconnect but reset when leaving the scene. */
export const nerfEquippedStore = writable(false);
