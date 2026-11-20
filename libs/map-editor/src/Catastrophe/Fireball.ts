import { meteorShape } from "./Meteor";

/** The embers of a fireball land within this many times the radius of its crater, never inside it. */
export const FIREBALL_EMBER_REACH = 2;
/** The radius of the patch of fire an ember sets where it lands, in tiles. */
export const FIREBALL_EMBER_PATCH_TILES = 1;
/** A fireball throws this many embers for each tile of the radius of its crater, and never more than that many. */
export const FIREBALL_EMBERS_PER_TILE = 3;
export const FIREBALL_MAX_EMBERS = 48;

/** A draw from 0 to 1 that only depends on its seed: the embers of a fireball are the same wherever they are read. */
function drawsOf(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Where the embers of a fireball land, in tiles from the centre of its crater: all around it, between its edge and
 * FIREBALL_EMBER_REACH times its radius. What takes fire there is the business of the meadow.
 */
export function fireballEmbers(id: number, radiusTiles: number): { dx: number; dy: number }[] {
    const radius = meteorShape(radiusTiles).radiusTiles;
    const count = Math.min(FIREBALL_MAX_EMBERS, radius * FIREBALL_EMBERS_PER_TILE);
    const draw = drawsOf(Number.isFinite(id) ? Math.round(id) : 0);
    const embers: { dx: number; dy: number }[] = [];
    for (let index = 0; index < count; index++) {
        // Spread all around, each in its own slice of the circle.
        const turn = ((index + draw()) / count) * 2 * Math.PI;
        const far = radius * (1 + draw() * (FIREBALL_EMBER_REACH - 1));
        embers.push({ dx: Math.cos(turn) * far, dy: Math.sin(turn) * far });
    }
    return embers;
}
