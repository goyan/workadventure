import { derived, writable } from "svelte/store";
import { fireConditionsStore } from "./FireConditionsStore";

/**
 * The fast water of the room, as the server last told it: how many times faster than reality the water, the snow
 * and the ice of the room go while a player turned it on (FAST_WATER_TIMES); undefined while it is off. A state of
 * the room for everyone in it, never saved in the map.
 */
export const fastWaterStore = derived(fireConditionsStore, (conditions) =>
    conditions?.fastWater ? conditions.fastWater : undefined,
);

/** What the fast water of the room is for this player, kept up to date by the game scene. */
export interface FastWaterRights {
    /** Whether this player may turn it on or off: the right to edit the map, as for its weather. */
    allowed: boolean;
    /** How many times faster than reality the map itself says its water goes. */
    mapTimes: number;
    /** The map already goes as fast or faster: the fast water would change nothing. */
    mapFaster: boolean;
}

export const fastWaterRightsStore = writable<FastWaterRights>({ allowed: false, mapTimes: 1, mapFaster: false });

let send: ((on: boolean) => void) | undefined;

/** The game scene says how the room is asked (its connection); none outside a room. */
export function setFastWaterSender(sender: ((on: boolean) => void) | undefined): void {
    send = sender;
}

/** Asks the room to turn its fast water on or off. The server decides, and tells everyone. */
export function requestFastWater(on: boolean): void {
    send?.(on);
}
