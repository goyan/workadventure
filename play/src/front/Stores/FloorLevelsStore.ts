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
    /** The altitude of the avatar over the ground of the map, in pixels of altitude (maps with a relief only). */
    altitude?: number;
    /** The altitude of the ground under the pointer (see pointerAltitude), told with the one of the avatar. */
    pointerAltitude?: number;
}

/** The raised floors that have slabs on the map, the floor of the avatar, and whether the map editor is open. */
export const floorLevelsBuiltStore = writable<readonly number[]>([]);
export const floorLevelCurrentStore = writable<number>(0);
export const floorLevelsHiddenStore = writable<boolean>(false);
export const floorLevelViewedStore = writable<number | undefined>(undefined);
/** The altitude of the avatar (see avatarAltitude); undefined on a map without relief. */
export const avatarAltitudeStore = writable<number | undefined>(undefined);
/** The altitude of the ground under the pointer (see pointerAltitude); undefined off the game or without relief. */
export const pointerAltitudeStore = writable<number | undefined>(undefined);

/**
 * A floor named as in the map editor, counted from the ground: "Sol", "Étage 1", "Étage 2"… among the floors that have
 * slabs (`built`). A height with no slab yet keeps the height of its walls: "Niveau 2+3".
 */
export function floorLevelName(ll: TranslationFunctions, elevation: number, built: readonly number[] = []): string {
    if (elevation <= 0) return ll.mapEditor.mapLayer.floorLevel.ground();
    const rank = [...built].sort((a, b) => a - b).indexOf(elevation) + 1;
    return rank > 0
        ? ll.mapEditor.mapLayer.floorLevel.storey({ rank })
        : ll.mapEditor.mapLayer.floorLevel.level({ height: floorLevelTiles(elevation) });
}

/**
 * The stack shown under the clock: none on a map without raised floors nor relief, nor while the map editor is open.
 * On a map with a relief it tells the altitude of the avatar, and the one of the ground under the pointer.
 */
export function floorLevelStack(
    built: readonly number[],
    current: number,
    hidden: boolean,
    name: (elevation: number) => string,
    viewed?: number,
    altitude?: number,
    pointerAltitude?: number,
): FloorLevelStack | undefined {
    if (hidden || (built.length === 0 && altitude === undefined)) return undefined;
    const levels = [...new Set([0, ...built])].sort((a, b) => b - a);
    return {
        levels: levels.map((elevation) => ({ elevation, name: name(elevation) })),
        current,
        viewed,
        ...(altitude === undefined ? {} : { altitude }),
        ...(altitude === undefined || pointerAltitude === undefined ? {} : { pointerAltitude }),
    };
}

/** Whether the stack pulses: once, when the floor of the avatar changes; never when motion is reduced. */
export function levelChangePulses(previous: number | undefined, next: number, reducedMotion: boolean): boolean {
    return !reducedMotion && previous !== undefined && previous !== next;
}

export const floorLevelsStore: Readable<FloorLevelStack | undefined> = derived(
    [
        floorLevelsBuiltStore,
        floorLevelCurrentStore,
        floorLevelsHiddenStore,
        LL,
        floorLevelViewedStore,
        avatarAltitudeStore,
        pointerAltitudeStore,
    ],
    ([built, current, hidden, ll, viewed, altitude, pointer]) =>
        floorLevelStack(
            built,
            current,
            hidden,
            (elevation) => floorLevelName(ll, elevation, built),
            viewed,
            altitude,
            pointer,
        ),
);
