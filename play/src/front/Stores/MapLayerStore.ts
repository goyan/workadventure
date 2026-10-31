import { writable } from "svelte/store";
import type { FloorFamily, WallTint } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

export type MapLayerMode = "wall" | "room" | "floorBrush" | "floorRectangle" | "floorFill" | "door" | "erase";

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

export type MapLayerStatus = "tooLarge" | "fillTooLarge" | "doorInvalid" | "failed";
export const mapLayerStatusStore = writable<MapLayerStatus | undefined>(undefined);
