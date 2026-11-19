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
