import type { WaveSettings } from "../types";

/**
 * The passes of a move of the water with inertia (WaterGrid.flowWithInertia), each over a range of rows of the
 * grid: what a kernel compiled for it does the very same way, to the bit, and what several threads may one day do
 * each on its rows. Nothing but sums, products, divisions and comparisons of the figures of the grid, in doubles
 * between the reading and the writing of a float: the same inputs give the same water everywhere.
 *
 * A move is four passes, each over all the rows before the next one starts: the flows (fluxPass), then, the speeds
 * of this move having taken the place of those of the move before, what each cell can afford (affordPass), the
 * flows cut down to it (scalePass), and the depths (depthsPass).
 */

/** Under this depth a cell is dry: the water left by rounding does not keep the grid moving. */
export const DRY_PX = 0.01;
/** A front whose surface drops less than this share of the water that passes is a swell: it does not break. */
export const BREAKING_CALM = 0.1;

/** What the passes of a move read and write: the arrays of the grid, and the figures of the step. */
export interface InertiaMove {
    width: number;
    height: number;
    /** Pixels of water over each cell, and its ground and the level its water spills at. */
    depth: Float32Array;
    ground: Float32Array;
    spill: Float32Array;
    /** The sides of each cell the water cannot cross, and whether the cell lies in a hollow of the relief. */
    closed: Uint8Array;
    hollow: Uint8Array;
    /** The friction of the ground of each cell, and the depths to the power -4/3 by eighths of a pixel. */
    rough: Float32Array;
    powers: Float32Array;
    /** The flow from each cell to the next one of its row and of its column, and what each cell can afford. */
    east: Float32Array;
    south: Float32Array;
    afford: Float32Array;
    /** The speeds of the move before, read by fluxPass, and those of this move, which it writes. */
    speedEast: Float32Array;
    speedSouth: Float32Array;
    nextSpeedEast: Float32Array;
    nextSpeedSouth: Float32Array;
    /** How long a move lasts (s), and the figures the step draws from it (see WaterGrid.flowWithInertia). */
    dt: number;
    swiftest: number;
    pull: number;
    pulled: number;
    edgeShare: number;
    top: number;
    /** How the water makes its waves (WaveSettings), within their bounds. */
    roughness: WaveSettings["roughness"];
    damping: WaveSettings["damping"];
    breaking: number;
    carried: number;
}

/** The flows pick up and slow down, over the rows from `rowFrom` to `rowTo` (left out). */
export function fluxPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
    const { width, height, depth, ground, closed, hollow, rough, powers, east, south } = move;
    const { speedEast, speedSouth, nextSpeedEast, nextSpeedSouth } = move;
    const { dt, swiftest, pull, pulled, roughness, damping, breaking, carried } = move;
    const lastPower = powers.length - 1;
    for (let row = rowFrom; row < rowTo; row++) {
        for (let column = 0; column < width; column++) {
            const index = row * width + column;
            const held = depth[index];
            const bed = ground[index];
            const surface = bed + held;
            if (column + 1 < width) {
                const other = index + 1;
                const otherHeld = depth[other];
                nextSpeedEast[index] = 0;
                if ((held <= 0 && otherHeld <= 0) || closed[index] & 1) east[index] = 0;
                else {
                    const otherBed = ground[other];
                    const otherSurface = otherBed + otherHeld;
                    // The water that passes: what stands over the higher of the two grounds.
                    const passing = Math.max(surface, otherSurface) - Math.max(bed, otherBed);
                    if (passing <= DRY_PX) east[index] = 0;
                    else {
                        const drop = surface - otherSurface;
                        const inWater = hollow[index] === 1 && hollow[other] === 1;
                        let flow = east[index] + pull * Math.min(passing, pulled) * drop;
                        if (carried > 0 && inWater) {
                            // The water brings the speed it had upstream, along the row and across it.
                            const along = speedEast[index];
                            const alongChange =
                                along > 0
                                    ? along - (column > 0 ? speedEast[index - 1] : 0)
                                    : (column + 2 < width ? speedEast[other] : 0) - along;
                            const across =
                                0.25 *
                                (speedSouth[index] +
                                    speedSouth[other] +
                                    (row > 0 ? speedSouth[index - width] + speedSouth[other - width] : 0));
                            const acrossChange =
                                across > 0
                                    ? along - (row > 0 ? speedEast[index - width] : along)
                                    : (row + 1 < height ? speedEast[index + width] : along) - along;
                            flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                        }
                        const speed = Math.abs(flow) / passing;
                        const eighths = (passing * 8) | 0;
                        let rate =
                            damping +
                            roughness *
                                0.5 *
                                (rough[index] + rough[other]) *
                                speed *
                                powers[eighths > lastPower ? lastPower : eighths];
                        if (breaking > 0 && inWater) {
                            rate += breaking * Math.max(Math.abs(drop) / passing - BREAKING_CALM, 0);
                        }
                        flow /= 1 + dt * rate;
                        if (flow > swiftest * passing) flow = swiftest * passing;
                        else if (flow < -swiftest * passing) flow = -swiftest * passing;
                        east[index] = flow;
                        // The speed the next move carries along: none through a film.
                        if (passing > 0.05) nextSpeedEast[index] = flow / passing;
                    }
                }
            }
            if (row + 1 < height) {
                const other = index + width;
                const otherHeld = depth[other];
                nextSpeedSouth[index] = 0;
                if ((held <= 0 && otherHeld <= 0) || closed[index] & 4) south[index] = 0;
                else {
                    const otherBed = ground[other];
                    const otherSurface = otherBed + otherHeld;
                    const passing = Math.max(surface, otherSurface) - Math.max(bed, otherBed);
                    if (passing <= DRY_PX) south[index] = 0;
                    else {
                        const drop = surface - otherSurface;
                        const inWater = hollow[index] === 1 && hollow[other] === 1;
                        let flow = south[index] + pull * Math.min(passing, pulled) * drop;
                        if (carried > 0 && inWater) {
                            const along = speedSouth[index];
                            const alongChange =
                                along > 0
                                    ? along - (row > 0 ? speedSouth[index - width] : 0)
                                    : (row + 2 < height ? speedSouth[other] : 0) - along;
                            const across =
                                0.25 *
                                (speedEast[index] +
                                    speedEast[other] +
                                    (column > 0 ? speedEast[index - 1] + speedEast[other - 1] : 0));
                            const acrossChange =
                                across > 0
                                    ? along - (column > 0 ? speedSouth[index - 1] : along)
                                    : (column + 1 < width ? speedSouth[index + 1] : along) - along;
                            flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                        }
                        const speed = Math.abs(flow) / passing;
                        const eighths = (passing * 8) | 0;
                        let rate =
                            damping +
                            roughness *
                                0.5 *
                                (rough[index] + rough[other]) *
                                speed *
                                powers[eighths > lastPower ? lastPower : eighths];
                        if (breaking > 0 && inWater) {
                            rate += breaking * Math.max(Math.abs(drop) / passing - BREAKING_CALM, 0);
                        }
                        flow /= 1 + dt * rate;
                        if (flow > swiftest * passing) flow = swiftest * passing;
                        else if (flow < -swiftest * passing) flow = -swiftest * passing;
                        south[index] = flow;
                        if (passing > 0.05) nextSpeedSouth[index] = flow / passing;
                    }
                }
            }
        }
    }
}

/** A cell never gives more than it holds: what it gives is cut down, by all its sides alike. */
export function affordPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
    const { width, height, depth, east, south, afford, dt } = move;
    for (let row = rowFrom; row < rowTo; row++) {
        for (let column = 0; column < width; column++) {
            const index = row * width + column;
            let out = 0;
            if (column + 1 < width) out += Math.max(east[index], 0);
            if (column > 0) out += Math.max(-east[index - 1], 0);
            if (row + 1 < height) out += Math.max(south[index], 0);
            if (row > 0) out += Math.max(-south[index - width], 0);
            afford[index] = out * dt > depth[index] ? depth[index] / (out * dt) : 1;
        }
    }
}

/** The flows are cut down to what the cells can afford. Returns whether any still moves water. */
export function scalePass(move: InertiaMove, rowFrom: number, rowTo: number): boolean {
    const { width, height, east, south, afford, dt } = move;
    let moved = false;
    for (let row = rowFrom; row < rowTo; row++) {
        for (let column = 0; column < width; column++) {
            const index = row * width + column;
            if (column + 1 < width && east[index] !== 0) {
                east[index] *= east[index] > 0 ? afford[index] : afford[index + 1];
                if (east[index] * dt > DRY_PX / 4 || east[index] * dt < -DRY_PX / 4) moved = true;
            }
            if (row + 1 < height && south[index] !== 0) {
                south[index] *= south[index] > 0 ? afford[index] : afford[index + width];
                if (south[index] * dt > DRY_PX / 4 || south[index] * dt < -DRY_PX / 4) moved = true;
            }
        }
    }
    return moved;
}

/**
 * The depths follow the flows. `lost` is the water lost so far (off the edge of the grid, over the highest level
 * a map may set): what these rows lose is added to it, cell after cell, and the sum is returned, with whether
 * any of it moved the water.
 */
export function depthsPass(
    move: InertiaMove,
    rowFrom: number,
    rowTo: number,
    lost: number,
): { lost: number; moved: boolean } {
    const { width, height, depth, ground, spill, east, south, dt, edgeShare, top } = move;
    let moved = false;
    for (let row = rowFrom; row < rowTo; row++) {
        for (let column = 0; column < width; column++) {
            const index = row * width + column;
            let net = 0;
            let outside = 0;
            if (column + 1 < width) net -= east[index];
            else outside++;
            if (column > 0) net += east[index - 1];
            else outside++;
            if (row + 1 < height) net -= south[index];
            else outside++;
            if (row > 0) net += south[index - width];
            else outside++;
            let held = depth[index] + net * dt;
            if (held < 0) held = 0;
            if (held > 0) {
                // Water at the edge of the grid falls away.
                if (outside > 0 && held > DRY_PX) {
                    const gone = Math.min(held, held * edgeShare * outside);
                    held -= gone;
                    lost += gone;
                    if (gone > DRY_PX / 4) moved = true;
                }
                // What stands over the highest level a map may set is lost.
                const over = ground[index] + held - (spill[index] + top);
                if (over > 0) {
                    const gone = Math.min(over, held);
                    held -= gone;
                    lost += gone;
                    moved = true;
                }
            }
            depth[index] = held;
        }
    }
    return { lost, moved };
}
