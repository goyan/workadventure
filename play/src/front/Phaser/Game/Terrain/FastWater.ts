import { FAST_WATER_TIMES, roomWaterTimesOf, waterTimesOf } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { fastWaterStore } from "../../../Stores/FastWaterStore";
import type { FastWaterRights } from "../../../Stores/FastWaterStore";

/** How many times faster than reality the water, the snow and the ice of the room go now: the map's, or the fast. */
export function roomWaterTimes(water: { speed?: number } | undefined): number {
    return roomWaterTimesOf(water, get(fastWaterStore));
}

/** What the fast water is for a player who may (or may not) edit the map, on a map whose water goes so fast. */
export function fastWaterRightsOf(allowed: boolean, water: { speed?: number } | undefined): FastWaterRights {
    const mapTimes = waterTimesOf(water);
    return { allowed, mapTimes, mapFaster: mapTimes >= FAST_WATER_TIMES };
}
