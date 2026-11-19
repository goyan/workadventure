/** How long a meteor falls before it hits the ground, in milliseconds. */
export const METEOR_FALL_MS = 1200;
/** The radius, in cells, of the crater: the water of these cells is thrown out, carried away by the wave. */
export const METEOR_DISC_CELLS = 8;
/** Pixels of water the meteor brings to each cell of its crater. */
export const METEOR_ADDED_PX = 8;
/** How far from the impact the wave goes, in cells. */
export const METEOR_WAVE_CELLS = 64;
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
