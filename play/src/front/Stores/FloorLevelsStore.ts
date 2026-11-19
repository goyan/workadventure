import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { LL } from "../../i18n/i18n-svelte";
import type { TranslationFunctions } from "../../i18n/i18n-types";
import { floorLevelTiles } from "../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

export interface FloorLevelStack {
    /** The floors of the map, the highest first, the ground last. */
    levels: { elevation: number; name: string }[];
    /** The floor the avatar stands on (the last one while it is on a stair). */
    current: number;
    /** Manual display ceiling; undefined follows the avatar. */
    viewed?: number;
}

/** The raised floors that have slabs on the map, the floor of the avatar, and whether the map editor is open. */
export const floorLevelsBuiltStore = writable<readonly number[]>([]);
export const floorLevelCurrentStore = writable<number>(0);
export const floorLevelsHiddenStore = writable<boolean>(false);
export const floorLevelViewedStore = writable<number | undefined>(undefined);

/** A floor named as in the map editor: "Sol", "Niveau 2", "Niveau 2+3". */
export function floorLevelName(ll: TranslationFunctions, elevation: number): string {
    return elevation > 0
        ? ll.mapEditor.mapLayer.floorLevel.level({ height: floorLevelTiles(elevation) })
        : ll.mapEditor.mapLayer.floorLevel.ground();
}

/** The stack shown under the clock: none on a map without raised floors, nor while the map editor is open. */
export function floorLevelStack(
    built: readonly number[],
    current: number,
    hidden: boolean,
    name: (elevation: number) => string,
    viewed?: number,
): FloorLevelStack | undefined {
    if (hidden || built.length === 0) return undefined;
    const levels = [...new Set([0, ...built])].sort((a, b) => b - a);
    return { levels: levels.map((elevation) => ({ elevation, name: name(elevation) })), current, viewed };
}

/** Whether the stack pulses: once, when the floor of the avatar changes; never when motion is reduced. */
export function levelChangePulses(previous: number | undefined, next: number, reducedMotion: boolean): boolean {
    return !reducedMotion && previous !== undefined && previous !== next;
}

export const floorLevelsStore: Readable<FloorLevelStack | undefined> = derived(
    [floorLevelsBuiltStore, floorLevelCurrentStore, floorLevelsHiddenStore, LL, floorLevelViewedStore],
    ([built, current, hidden, ll, viewed]) =>
        floorLevelStack(built, current, hidden, (elevation) => floorLevelName(ll, elevation), viewed),
);
