import type { TerrainWaterStatsMessage } from "@workadventure/messages";
import { writable } from "svelte/store";
import type { LifeSpeciesView } from "../Phaser/Game/Life/LifeSpeciesStats";
import type { LifeStatsView } from "../Phaser/Game/Life/LifeStats";
import type { TerrainBrush } from "../Phaser/Game/Terrain/TerrainStroke";

/** The brush of the relief tool of the map editor, kept while the editor stays open. */
export const DEFAULT_TERRAIN_BRUSH: TerrainBrush = { mode: "dig", diameterTiles: 4, forcePx: undefined };
export const terrainBrushStore = writable<TerrainBrush>(DEFAULT_TERRAIN_BRUSH);

/** Whether the pointer is over ground that may not be dug (indoors, under a wall): the panel says why nothing happens. */
export const terrainBlockedStore = writable(false);

/** What comes into the water of the map and goes out of it, as the server last told (the dashboard of the relief tool). */
export const terrainWaterStatsStore = writable<TerrainWaterStatsMessage | undefined>(undefined);

/** The figures of the life of the water of the map (the dashboard of the life tool); undefined until told. */
export const aquaticLifeStatsStore = writable<LifeStatsView | undefined>(undefined);
/** The same species by species; no row on a map without life, or whose server does not tell of the species. */
export const aquaticLifeSpeciesStore = writable<LifeSpeciesView | undefined>(undefined);
