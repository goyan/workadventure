import type { FireConditionsMessage } from "@workadventure/messages";
import { writable } from "svelte/store";

/**
 * The conditions the fire of the room goes by, as the server last told them: the heat, the humidity of the air, the
 * wind and the thresholds, set by hand or real. Undefined until the room is joined.
 */
export const fireConditionsStore = writable<FireConditionsMessage | undefined>(undefined);
