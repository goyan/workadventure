import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import { LL } from "../../i18n/i18n-svelte";
import type { TranslationFunctions } from "../../i18n/i18n-types";
import { samePointerGround } from "../Phaser/Game/Floors/AvatarAltitude";
import type { PointerGround } from "../Phaser/Game/Floors/AvatarAltitude";
import { floorLevelTiles } from "../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
import { mapEditorPlacementLevelStore } from "./MapEditorStore";
import { mapLayerLevelStore } from "./MapLayerStore";

export interface FloorLevelStack {
    /** The floors of the map, the highest first, the ground last. */
    levels: { elevation: number; name: string }[];
    /** The floor the avatar stands on (the last one while it is on a stair). */
    current: number;
    /** Manual display ceiling; undefined follows the avatar. */
    viewed?: number;
    /** The altitude of the avatar over the ground of the map, in pixels of altitude (maps with a relief only). */
    altitude?: number;
    /** The ground and the water under the pointer (see pointerGroundAt), told with the altitude of the avatar. */
    pointer?: PointerGround;
}

/** The level the map editor works on: the one chosen in its panel, and in "auto" the one under the pointer. */
export interface EditorFloorLevel {
    choice: "auto" | number;
    level: number;
}

/** The raised floors that have slabs on the map, the floor of the avatar, and whether the map editor is open. */
export const floorLevelsBuiltStore = writable<readonly number[]>([]);
export const floorLevelCurrentStore = writable<number>(0);
export const floorLevelsHiddenStore = writable<boolean>(false);
export const floorLevelViewedStore = writable<number | undefined>(undefined);
/** The altitude of the avatar (see avatarAltitude); undefined on a map without relief. */
export const avatarAltitudeStore = writable<number | undefined>(undefined);
/** The ground and the water under the pointer (see pointerGroundAt); undefined off the game or without relief. */
export const pointerGroundStore = writable<PointerGround | undefined>(undefined);
let shownPointerGround: PointerGround | undefined;

/** Tells the ground under the pointer, read at each frame: the stack is drawn again only when what it shows changes. */
export function showPointerGround(ground: PointerGround | undefined): void {
    if (samePointerGround(ground, shownPointerGround)) return;
    shownPointerGround = ground;
    pointerGroundStore.set(ground);
}

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
 * The stack shown under the clock: none on a map without raised floors nor relief. On a map with a relief it tells the
 * altitude of the avatar, and the ground and the water under the pointer. While the map editor is open (`editor`), it
 * shows the level the editor works on instead of the floor of the avatar and of the display ceiling of the game.
 */
export function floorLevelStack(
    built: readonly number[],
    current: number,
    editor: EditorFloorLevel | undefined,
    name: (elevation: number) => string,
    viewed?: number,
    altitude?: number,
    pointer?: PointerGround,
): FloorLevelStack | undefined {
    if (built.length === 0 && altitude === undefined) return undefined;
    const chosen = editor === undefined || editor.choice === "auto" ? undefined : editor.choice;
    // In game, the floor of the avatar is in the stack even when it is no storey (on the deck of a bridge).
    const own = editor === undefined && current > 0 ? [current] : [];
    const levels = [...new Set([0, ...built, ...own, ...(chosen === undefined ? [] : [chosen])])].sort((a, b) => b - a);
    return {
        levels: levels.map((elevation) => ({ elevation, name: name(elevation) })),
        current: editor === undefined ? current : (chosen ?? editor.level),
        viewed: editor === undefined ? viewed : chosen,
        ...(altitude === undefined ? {} : { altitude }),
        ...(altitude === undefined || pointer === undefined ? {} : { pointer }),
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
        pointerGroundStore,
        mapEditorPlacementLevelStore,
        mapLayerLevelStore,
    ],
    ([built, current, hidden, ll, viewed, altitude, pointer, choice, level]) =>
        floorLevelStack(
            built,
            current,
            hidden ? { choice, level } : undefined,
            (elevation) => floorLevelName(ll, elevation, built),
            viewed,
            altitude,
            pointer,
        ),
);
