import { writable } from "svelte/store";

/** Session equipment, kept through a reconnect but reset when leaving the scene. */
export const nerfEquippedStore = writable(false);

/** Hearts of the local player, in thirds (see NerfHearts); undefined while the Nerf is put away. */
export const nerfHeartsStore = writable<{ thirds: number; jailed: boolean } | undefined>(undefined);
