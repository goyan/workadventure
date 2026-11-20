import { writable } from "svelte/store";
import type { FloorFamily, WallHeight, WallTint } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import type { DoorHeightSetting } from "../Phaser/Game/MapEditor/MapLayer/MapLayerOperations";
import type { StairDirection, StairWidth } from "../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

export type MapLayerMode =
    | "wall"
    | "room"
    | "floorBrush"
    | "floorRectangle"
    | "floorFill"
    | "door"
    | "window"
    | "height"
    | "erase"
    | "slab"
    | "stair";

export const mapLayerModeStore = writable<MapLayerMode>("wall");
export const mapLayerFloorFamilyStore = writable<FloorFamily>("carrelage-gris");
export const mapLayerWallTintStore = writable<WallTint>("blanc");

/** Height of what is drawn, one setting per mode: the walls (and the walls of a room), the doors, the windows. */
export const mapLayerWallHeightStore = writable<WallHeight>(1);
/** The doors: "auto" (the default) gives a door the height of its wall, two tiles at most. */
export const mapLayerDoorHeightStore = writable<DoorHeightSetting>("auto");
export const mapLayerWindowHeightStore = writable<WallHeight>(1);

/**
 * In the height mode, what is selected: how many walls, doors and windows, their common height (undefined when they
 * differ or nothing is selected), and the heights the catalogs have for all of them.
 */
export interface MapLayerHeightSelection {
    count: number;
    height: WallHeight | undefined;
    available: readonly WallHeight[];
}
export const mapLayerHeightSelectionStore = writable<MapLayerHeightSelection>({
    count: 0,
    height: undefined,
    available: [1],
});
/** A height asked for the selection by the panel; the tool applies it, then sets the store back to undefined. */
export const mapLayerHeightRequestStore = writable<WallHeight | undefined>(undefined);

/** Heights whose pieces the loaded catalogs have (1 is always there). */
export const mapLayerWallHeightsAvailableStore = writable<readonly WallHeight[]>([1]);
export const mapLayerDoorHeightsAvailableStore = writable<readonly WallHeight[]>([1]);
/** Heights the door catalog has for the glazed doors (`porte-h-<teinte>-g-vitree-hN`); a glazed door of another height goes back to 1. */
export const mapLayerGlazedDoorHeightsAvailableStore = writable<readonly WallHeight[]>([1]);
export const mapLayerWindowHeightsAvailableStore = writable<readonly WallHeight[]>([1]);

/** Image URL of a sample of each floor family and wall tint, shown in the panel. Filled once the catalogs are loaded. */
export const mapLayerFloorSwatchesStore = writable<Partial<Record<FloorFamily, string>>>({});
export const mapLayerWallSwatchesStore = writable<Partial<Record<WallTint, string>>>({});

/** Whether the floor and wall catalogs are loaded in the current room. Undefined while it is being checked. */
export const mapLayerCatalogAvailableStore = writable<boolean | undefined>(undefined);

/** Whether the door catalog is loaded in the current room: the door mode is disabled without it. */
export const mapLayerDoorsAvailableStore = writable<boolean>(false);

/** Whether the slabs laid are of glass, instead of the floor chosen. */
export const mapLayerSlabGlassStore = writable<boolean>(false);
/** Whether the catalog of the raised floors has the glass slab: the "Glass" switch is disabled without it. */
export const mapLayerGlassSlabsAvailableStore = writable<boolean>(false);
/** Whether the catalog of the room has the new short stairs (-v2): the stair mode places them, else the old ones. */
export const mapLayerShortStairsAvailableStore = writable<boolean>(false);
/** Whether the slabs laid are sleepers of wood (the deck of a bridge), instead of the floor chosen. */
export const mapLayerSlabWoodStore = writable<boolean>(false);
/** Whether the stair mode places a ramp of wood instead of steps. */
export const mapLayerStairRampStore = writable<boolean>(false);
/**
 * Whether the catalog of the room has the pieces of the bridges: the slab of wood, the ramps, and the stairs to the
 * low floor. Without them the two switches are disabled and the low floor is not offered.
 */
export const mapLayerBridgePiecesAvailableStore = writable<boolean>(false);

/** Whether the door catalog of the current room has the glazed doors: the "Glazed" switch is disabled without them. */
export const mapLayerGlazedDoorsAvailableStore = writable<boolean>(false);

/** Whether the door mode places glazed horizontal doors; kept for the page, like the wall tint. */
export const mapLayerDoorGlazedStore = writable<boolean>(false);

/** Whether the window catalog is loaded in the current room: the window mode is disabled without it. */
export const mapLayerWindowsAvailableStore = writable<boolean>(false);

export type MapLayerStatus =
    | "tooLarge"
    | "fillTooLarge"
    | "doorInvalid"
    | "doorsUnavailable"
    | "windowInvalid"
    | "windowsUnavailable"
    | "slabOnGround"
    | "stairInvalid"
    | "stairNoArrival"
    | "failed";
export const mapLayerStatusStore = writable<MapLayerStatus | undefined>(undefined);

/** The modes that lay the raised floors: slabs and stairs (the eraser removes them with the rest). */
export function isFloorMode(mode: MapLayerMode): mode is "slab" | "stair" {
    return mode === "slab" || mode === "stair";
}

/** Whether the catalog of the raised floors (slabs and stairs) is loaded in the current room. */
export const mapLayerFloorsAvailableStore = writable<boolean>(false);
/** The floor being edited: its altitude in pixels above the ground; 0 is the ground. */
export const mapLayerLevelStore = writable<number>(0);
/** The floors the panel offers above the ground, lowest first. */
export const mapLayerLevelsStore = writable<readonly number[]>([]);
/** Among them, the floors that have slabs on the map, lowest first: the first one is the floor 1, and so on. */
export const mapLayerBuiltLevelsStore = writable<readonly number[]>([]);
/** Armed by the panel: the next click on the map picks the floor under the pointer instead of drawing. */
export const mapLayerPickLevelStore = writable<boolean>(false);

/** The stair the stair mode places. */
export const mapLayerStairDirectionStore = writable<StairDirection>("n");
export const mapLayerStairWidthStore = writable<StairWidth>(1);
/** The floor the stair goes up to; undefined (or a floor out of reach): the first one a stair can reach. */
export const mapLayerStairTargetStore = writable<number | undefined>(undefined);
/** Whether its side is open (its stringer only) instead of full. */
export const mapLayerStairOpenStore = writable<boolean>(true);

/**
 * The modes that draw walls, doors and windows: they edit the level chosen in the panel, the ground or a raised floor.
 * (The floor modes of the ground always edit the ground: the floor of a raised floor is its slabs.)
 */
export function isWallLevelMode(mode: MapLayerMode): boolean {
    return (
        mode === "wall" ||
        mode === "room" ||
        mode === "door" ||
        mode === "window" ||
        mode === "height" ||
        mode === "erase"
    );
}

/** Whether the catalogs of the walls of the raised floors are loaded in the current room. */
export const mapLayerUpperWallsAvailableStore = writable<boolean>(false);

/** Whether a mode shows the choice of the level: the modes of the raised floors, and the wall modes once they can. */
export function usesLevel(mode: MapLayerMode, upperWallsAvailable: boolean): boolean {
    return isFloorMode(mode) || (upperWallsAvailable && isWallLevelMode(mode));
}
