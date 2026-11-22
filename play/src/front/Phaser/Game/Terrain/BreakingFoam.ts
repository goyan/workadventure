import { cellKey, heightAt, steadyFlowSpeed, waveSpeed } from "@workadventure/map-editor";
import type { TerrainData, WaterWallSides } from "@workadventure/map-editor";
import type { SettledWater } from "./TerrainWater";

/** Water thinner than this is a film: it neither breaks nor makes a front. */
const WET_PX = 0.5;
/**
 * A wave breaks when it is high for the water it runs in: its height (how far its surface stands over the lowest
 * water a few cells around) over the depth of that trough. Under the first share it is a swell, however high over
 * deep water (the long wave of an impact at sea: no foam); from the second on it is all foam: 0.78, the height at
 * which a wave breaks in shallow water (McCowan). So a swell starts foaming as the bottom rises under it.
 */
export const BREAKING_FROM = 0.3;
export const BREAKING_FULL = 0.78;
/** How far around a cell the trough of its wave is looked for, in cells (about a metre and a half). */
const TROUGH_REACH = 3;
/** A wave lower than this, in pixels (10 cm), is a ripple: it makes no foam. */
const LOWEST_WAVE_PX = 3;
/** A wave this high, in pixels (40 cm), makes all the foam its steepness asks for; a lower one, less of it. */
const FULL_WAVE_PX = 12;
/** The front of a flood: a cell that was dry and now holds this much water, come from a neighbour already wet. */
const FRONT_PX = 1;
const NEIGHBOUR_WET_PX = 2;
/**
 * White water: water that falls down a slope faster than its own waves run (a torrent down a steep bank, a
 * waterfall; the ratio of the two speeds is its Froude number). Foam from this ratio on, all of it at the second.
 * Water that creeps down the same slope makes none: the slope of the ground is not a wave.
 */
const RAPID_FROM = 1;
const RAPID_FULL = 2;
/** The foam left behind fades by half in this long, in ms. */
export const FOAM_HALF_LIFE_MS = 1800;
/** Foam fainter than this is gone. */
const GONE = 0.04;

/** Whether the water cannot go from a cell of the map to its neighbour on a side: 0 east, 1 west, 2 south, 3 north. */
export type ClosedSide = (cellX: number, cellY: number, side: number) => boolean;

/** The sides the walls of a map close (and its doors, taken closed), as foamOfCell asks for them. */
export function closedSidesOf(walls: WaterWallSides): ClosedSide {
    return (cellX, cellY, side) =>
        side === 0
            ? walls.east.has(cellKey(cellX, cellY))
            : side === 1
              ? walls.east.has(cellKey(cellX - 1, cellY))
              : side === 2
                ? walls.south.has(cellKey(cellX, cellY))
                : walls.south.has(cellKey(cellX, cellY - 1));
}

/**
 * How much foam the water of a cell makes in this state, from 0 to 1: where a wave breaks (high for the water it
 * runs in: near the shores, over a shoal, where the rim of an impact falls back), where the water rushes (faster
 * than its own waves: a torrent down a steep slope, a waterfall), and at the front of a flood that reaches dry
 * ground. None on a swell over deep water, however high, nor on water that rises evenly (rain filling a pond),
 * nor on a sheet that creeps down a slope (the slope of the ground is not a wave), nor between two waters a wall
 * keeps at two levels (`closed`: the sides the water cannot cross).
 */
export function foamOfCell(
    water: SettledWater,
    terrain: TerrainData | undefined,
    column: number,
    row: number,
    closed?: ClosedSide,
): number {
    const { width, height, depths, before } = water;
    if (column < 0 || row < 0 || column >= width || row >= height) return 0;
    const index = row * width + column;
    const depth = depths[index];
    if (depth < WET_PX) return 0;
    const bed = heightAt(terrain, water.x + column, water.y + row);
    const surface = bed + depth;
    const timed = before.length === depths.length && Number.isFinite(water.seconds);
    // The front of a flood: dry a state ago, wet now, next to water that was already there.
    const arrived = timed && before[index] < WET_PX && depth >= FRONT_PX;
    // The lowest water around: the trough of the wave this cell is the crest of, if it is one.
    let trough = surface;
    let fed = false;
    // How far the surface drops to the next cell, at most (the slope the water runs down), and to the lowest water
    // it falls to.
    let drop = 0;
    let fall = 0;
    for (let side = 0; side < 4; side++) {
        const stepColumn = side === 0 ? 1 : side === 1 ? -1 : 0;
        const stepRow = side === 2 ? 1 : side === 3 ? -1 : 0;
        for (let away = 1; away <= TROUGH_REACH; away++) {
            const otherColumn = column + stepColumn * away;
            const otherRow = row + stepRow * away;
            if (otherColumn < 0 || otherRow < 0 || otherColumn >= width || otherRow >= height) break;
            // A wall ends the water that way: what stands behind it is another water, at its own level.
            if (closed?.(water.x + otherColumn - stepColumn, water.y + otherRow - stepRow, side)) break;
            const other = otherRow * width + otherColumn;
            if (away === 1 && arrived && before[other] >= NEIGHBOUR_WET_PX) fed = true;
            // Dry ground ends the water that way: a bank is not a trough.
            if (depths[other] < WET_PX) break;
            const otherSurface = heightAt(terrain, water.x + otherColumn, water.y + otherRow) + depths[other];
            if (away === 1 && surface - otherSurface > drop) drop = surface - otherSurface;
            if (surface - otherSurface > fall) fall = surface - otherSurface;
            // Water lower than the ground of this cell is water it runs down to, not the trough of a wave it
            // stands in: the slope of the ground is not a wave.
            if (otherSurface < bed) break;
            if (otherSurface < trough) trough = otherSurface;
        }
    }
    const wave = surface - trough;
    // The water left under the trough, where the wave runs: never less than a film.
    const under = Math.max(WET_PX, depth - wave);
    const high = wave >= LOWEST_WAVE_PX ? wave / under : 0;
    // A low wave that breaks in a film of water leaves a little foam, a high one a lot.
    const size = Math.max(0, Math.min(1, (wave - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
    const breaking =
        Math.max(0, Math.min(1, (high - BREAKING_FROM) / (BREAKING_FULL - BREAKING_FROM))) * (0.3 + 0.7 * size);
    // White water: water that falls as high as a wave that would foam, and runs faster than its own waves: as fast
    // as the server tells it runs; where it tells none (a water without inertia), as fast as it runs down the slope
    // of its surface.
    let rapid = 0;
    if (fall >= LOWEST_WAVE_PX) {
        const told = water.speedAt?.(water.x + column, water.y + row);
        const speed = told ? Math.hypot(told.x, told.y) : steadyFlowSpeed(drop, depth, false);
        const waves = waveSpeed(depth);
        const rush = waves > 0 ? speed / waves : 0;
        const fallen = Math.max(0, Math.min(1, (fall - LOWEST_WAVE_PX) / (FULL_WAVE_PX - LOWEST_WAVE_PX)));
        rapid = Math.max(0, Math.min(1, (rush - RAPID_FROM) / (RAPID_FULL - RAPID_FROM))) * (0.3 + 0.7 * fallen);
    }
    const made = Math.max(breaking, rapid);
    return arrived && fed ? Math.max(made, 0.6) : made;
}

/**
 * The foam of the waves of the water of the relief, as this browser draws it: born where a wave breaks or a flood
 * advances, it stays a moment behind the wave and fades. Read from the depths the server already sends; each
 * browser makes its own, a decor.
 */
export class BreakingFoam {
    private strength = new Float32Array(0);
    private grid = { x: 0, y: 0, width: 0, height: 0 };
    private at = 0;
    private strongest = 0;

    /** A new state of the water at this time (ms): what broke since leaves its foam, the old one having faded. */
    public absorb(water: SettledWater, terrain: TerrainData | undefined, now: number, closed?: ClosedSide): void {
        const size = water.width * water.height;
        const same =
            water.x === this.grid.x &&
            water.y === this.grid.y &&
            water.width === this.grid.width &&
            water.height === this.grid.height &&
            this.strength.length === size;
        if (!same) {
            this.strength = new Float32Array(size);
            this.grid = { x: water.x, y: water.y, width: water.width, height: water.height };
            this.strongest = 0;
        }
        const faded = this.fade(now);
        const strength = this.strength;
        let strongest = 0;
        for (let row = 0; row < water.height; row++) {
            for (let column = 0; column < water.width; column++) {
                const index = row * water.width + column;
                let held = strength[index] * faded;
                // Dry cells are most of a map: nothing to look at there but the foam left, which fades.
                if (water.depths[index] >= WET_PX) {
                    const made = foamOfCell(water, terrain, column, row, closed);
                    if (made > held) held = made;
                } else held = 0;
                if (held < GONE) held = 0;
                strength[index] = held;
                if (held > strongest) strongest = held;
            }
        }
        this.strongest = strongest;
        this.at = now;
    }

    /** Whether any foam is left to draw at this time. */
    public active(now: number): boolean {
        return this.strongest * this.fade(now) >= GONE;
    }

    /** The foam over a cell of the map at this time, from 0 to 1. */
    public foamAt(cellX: number, cellY: number, now: number): number {
        const column = cellX - this.grid.x;
        const row = cellY - this.grid.y;
        if (column < 0 || row < 0 || column >= this.grid.width || row >= this.grid.height) return 0;
        const held = this.strength[row * this.grid.width + column] * this.fade(now);
        return held < GONE ? 0 : held;
    }

    public clear(): void {
        this.strength.fill(0);
        this.strongest = 0;
    }

    /** What is left of a foam since the last state: half of it every FOAM_HALF_LIFE_MS. */
    private fade(now: number): number {
        const elapsed = Math.max(0, now - this.at);
        return Math.pow(0.5, elapsed / FOAM_HALF_LIFE_MS);
    }
}
