import { TERRAIN_CELL, TILE_PX } from "../types";

/** How long a meteor falls before it hits the ground, in milliseconds. */
export const METEOR_FALL_MS = 1200;
/** Pixels of water the meteor brings to each cell of its crater. */
export const METEOR_ADDED_PX = 8;
/** How many cells the front of the wave advances at each step of the water. */
export const METEOR_WAVE_CELLS_PER_STEP = 1;
/** What a cell of open water keeps of the wave going by, in pixels: a swell, the rest goes on to the shore. */
export const METEOR_CREST_PX = 0.5;
/** The depth from which a cell is open water for the wave, in pixels. */
export const METEOR_DEEP_PX = 8;
/** The time a player waits between two meteors, in milliseconds. */
export const METEOR_COOLDOWN_MS = 3000;
/** How many meteors can be falling at once in a room. */
export const METEORS_PER_ROOM = 5;

/** The radius of the crater of a meteor, in tiles: what a player chooses, from a pebble to the end of a lake. */
export const METEOR_MIN_TILES = 2;
export const METEOR_MAX_TILES = 24;
export const METEOR_DEFAULT_TILES = 4;
/** The wave of an impact goes this many times the radius of its crater, never less nor more than these (cells). */
const WAVE_REACH = 6;
const MIN_WAVE_CELLS = 64;
const MAX_WAVE_CELLS = 240;

/** What a meteor does to the water, in cells: the crater it empties, and how far its wave goes. */
export interface MeteorShape {
    radiusTiles: number;
    discCells: number;
    waveCells: number;
}

/** The shape of a meteor of that size; a size that is not a number is the usual one, one out of range the nearest. */
export function meteorShape(radiusTiles: number): MeteorShape {
    const tiles = Number.isFinite(radiusTiles)
        ? Math.min(METEOR_MAX_TILES, Math.max(METEOR_MIN_TILES, Math.round(radiusTiles)))
        : METEOR_DEFAULT_TILES;
    const discCells = (tiles * TILE_PX) / TERRAIN_CELL;
    return {
        radiusTiles: tiles,
        discCells,
        waveCells: Math.min(MAX_WAVE_CELLS, Math.max(MIN_WAVE_CELLS, discCells * WAVE_REACH)),
    };
}
