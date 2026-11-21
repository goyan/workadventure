import type { WaterGrid } from "../Terrain/WaterGrid";
import { METEOR_ADDED_PX, METEOR_CREST_PX, METEOR_DEEP_PX, METEOR_WAVE_CELLS_PER_STEP } from "./Meteor";
import type { MeteorShape } from "./Meteor";

/** The wave an impact sends out: where it started, how far its front is, and the water it still carries. */
export interface ImpactWave {
    cellX: number;
    cellY: number;
    /** The crater it left and how far it goes, in cells. */
    discCells: number;
    waveCells: number;
    /** The front of the wave, in cells from the impact. */
    radius: number;
    /** The water the wave carries, in pixels of water over one cell. */
    carriedPx: number;
}

/**
 * An impact at a cell of the map: the water of the crater is thrown out, and a wave carries it away with the water
 * the meteor brings (`addedPx`). Undefined outside the grid or in a wall: nothing happens there.
 */
export function startImpactWave(
    grid: WaterGrid,
    cellX: number,
    cellY: number,
    shape: MeteorShape,
): { wave: ImpactWave; addedPx: number } | undefined {
    const crater = grid.takeDisc(cellX, cellY, shape.discCells);
    if (!crater) return undefined;
    const addedPx = METEOR_ADDED_PX * crater.cells;
    return {
        wave: {
            cellX,
            cellY,
            discCells: shape.discCells,
            waveCells: shape.waveCells,
            radius: shape.discCells,
            carriedPx: crater.takenPx + addedPx,
        },
        addedPx,
    };
}

/**
 * One step of a wave: its front moves on, leaving a swell on open water and flooding the ground it reaches, never
 * behind a wall. At its end, the water that found no shore falls back into the crater; what does not fit there is
 * lost (`lostPx`). The grid it runs on may be another one than at the step before: the wave only keeps where it is.
 */
export function advanceImpactWave(grid: WaterGrid, wave: ImpactWave): { done: boolean; lostPx: number } {
    const front = Math.min(wave.waveCells, wave.radius + METEOR_WAVE_CELLS_PER_STEP);
    wave.carriedPx -= grid.layRing(
        wave.cellX,
        wave.cellY,
        wave.radius,
        front,
        wave.carriedPx,
        METEOR_CREST_PX,
        METEOR_DEEP_PX,
    );
    wave.radius = front;
    if (wave.carriedPx > 1e-3 && front < wave.waveCells) return { done: false, lostPx: 0 };
    const lostPx = Math.max(
        0,
        wave.carriedPx - grid.layRing(wave.cellX, wave.cellY, -1, wave.discCells, wave.carriedPx),
    );
    wave.carriedPx = 0;
    return { done: true, lostPx };
}

/** The water the blast drives away swells over a band this wide past its reach, in shares of the crater's radius. */
const BLAST_SWELL_REACH = 0.5;
/** ...and never narrower than this many cells. */
const BLAST_SWELL_MIN_CELLS = 3;

/**
 * The blast of an impact on the water around its crater. An impact moves far more water than the volume of what
 * fell: the shock drives the water away well past the crater, as the ejecta of a crater lie in a continuous blanket
 * out to two or three times its radius. Here the water between the crater and `reach` times its radius is driven
 * outwards: all of it next to the crater, less and less with the distance, none where the blast ends (a straight
 * line: a choice, the simplest that leaves no step in the water). What is driven away is laid as a swell past the
 * reach of the blast, over the level of a flood if need be; what finds no room there is lost (`lostPx`). In a closed
 * basin, a pool, most of the water is thrown out.
 *
 * Undefined, and nothing done, for a reach of one or less (the crater alone) or one that is not a number, and
 * outside the grid or in a wall.
 */
export function blastWater(
    grid: WaterGrid,
    cellX: number,
    cellY: number,
    shape: MeteorShape,
    reach: number,
): { movedPx: number; lostPx: number } | undefined {
    if (!Number.isFinite(reach) || reach <= 1) return undefined;
    const inner = shape.discCells;
    const outer = inner * reach;
    const movedPx = grid.takeRing(cellX, cellY, inner, outer, (distance) => 1 - (distance - inner) / (outer - inner));
    if (movedPx === undefined) return undefined;
    if (movedPx <= 0) return { movedPx: 0, lostPx: 0 };
    const swell = Math.max(BLAST_SWELL_MIN_CELLS, inner * BLAST_SWELL_REACH);
    const laid = grid.layRing(cellX, cellY, outer, outer + swell, movedPx, Infinity, Infinity, true);
    return { movedPx, lostPx: Math.max(0, movedPx - laid) };
}

/** The rim an impact throws up around its crater reaches this many times the radius of the crater. */
const RIM_REACH = 1.5;

/**
 * An impact on a map whose water has inertia: the water of the crater, and the water the meteor brings, are thrown
 * up in a rim around it (over the level of a flood if need be), and nothing else: the water itself then makes the
 * wave, which runs, breaks and floods as the map makes its water do. What finds no room in the rim is lost
 * (`lostPx`). Undefined outside the grid or in a wall: nothing happens there.
 */
export function strikeWater(
    grid: WaterGrid,
    cellX: number,
    cellY: number,
    shape: MeteorShape,
): { addedPx: number; lostPx: number } | undefined {
    const crater = grid.takeDisc(cellX, cellY, shape.discCells);
    if (!crater) return undefined;
    const addedPx = METEOR_ADDED_PX * crater.cells;
    const thrown = crater.takenPx + addedPx;
    const laid = grid.layRing(
        cellX,
        cellY,
        shape.discCells,
        shape.discCells * RIM_REACH,
        thrown,
        Infinity,
        Infinity,
        true,
    );
    return { addedPx, lostPx: Math.max(0, thrown - laid) };
}
