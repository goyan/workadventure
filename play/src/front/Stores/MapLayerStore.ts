import { writable } from "svelte/store";
import type { FloorFamily, WallHeight, WallTint } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

export type MapLayerMode =
    | "wall"
    | "room"
    | "floorBrush"
    | "floorRectangle"
    | "floorFill"
    | "door"
    | "window"
    | "erase";

export const mapLayerModeStore = writable<MapLayerMode>("wall");
export const mapLayerFloorFamilyStore = writable<FloorFamily>("carrelage-gris");
export const mapLayerWallTintStore = writable<WallTint>("blanc");

/** Height of what is drawn, one setting per mode: the walls (and the walls of a room), the doors, the windows. */
export const mapLayerWallHeightStore = writable<WallHeight>(1);
export const mapLayerDoorHeightStore = writable<WallHeight>(1);
export const mapLayerWindowHeightStore = writable<WallHeight>(1);

/** Heights whose pieces the loaded catalogs have (1 is always there). */
export const mapLayerWallHeightsAvailableStore = writable<readonly WallHeight[]>([1]);
export const mapLayerDoorHeightsAvailableStore = writable<readonly WallHeight[]>([1]);
export const mapLayerWindowHeightsAvailableStore = writable<readonly WallHeight[]>([1]);

/** Image URL of a sample of each floor family and wall tint, shown in the panel. Filled once the catalogs are loaded. */
export const mapLayerFloorSwatchesStore = writable<Partial<Record<FloorFamily, string>>>({});
export const mapLayerWallSwatchesStore = writable<Partial<Record<WallTint, string>>>({});

/** Whether the floor and wall catalogs are loaded in the current room. Undefined while it is being checked. */
export const mapLayerCatalogAvailableStore = writable<boolean | undefined>(undefined);

/** Whether the door catalog is loaded in the current room: the door mode is disabled without it. */
export const mapLayerDoorsAvailableStore = writable<boolean>(false);

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
