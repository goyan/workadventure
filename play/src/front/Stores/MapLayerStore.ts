import { writable } from "svelte/store";
import type { FloorFamily, WallHeight, WallTint } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import type { DoorHeightSetting } from "../Phaser/Game/MapEditor/MapLayer/MapLayerOperations";

export type MapLayerMode =
    | "wall"
    | "room"
    | "floorBrush"
    | "floorRectangle"
    | "floorFill"
    | "door"
    | "window"
    | "height"
    | "erase";

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
    | "failed";
export const mapLayerStatusStore = writable<MapLayerStatus | undefined>(undefined);
