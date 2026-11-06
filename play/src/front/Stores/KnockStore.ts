import { writable } from "svelte/store";
import type { KnockRequest } from "../Phaser/Game/Knock/KnockState";

/** The knocks on the doors of the areas the local player is inside, to answer. Written by the KnockManager only. */
export const knockRequestsStore = writable<KnockRequest[]>([]);
