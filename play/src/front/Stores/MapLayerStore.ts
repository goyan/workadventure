import { writable } from "svelte/store";
import type { FloorFamily, WallTint } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

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
