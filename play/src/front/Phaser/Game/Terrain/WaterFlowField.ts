import { CELL_METRES, heightAt, soilAt, soilRoughness, SPEED_UNITS, steadyFlowSpeed } from "@workadventure/map-editor";
import type { TerrainData, WaveSettings } from "@workadventure/map-editor";
import type { SettledWater } from "./TerrainWater";
import { STEADY_PX_PER_SECOND } from "./WaterTrend";

/** Water thinner than this is a film: it has no flow to show, and its edge is a shore. */
export const FLOW_MIN_DEPTH_PX = 0.5;
/** A surface that slopes less than this, in pixels a cell, is at rest. */
export const FLOW_REST_SLOPE = 0.02;
/**
 * The slowest water the server tells the speed of, in metres a second: a step of its speeds (a quarter of a cell a
 * second, about 0.14 m/s). Slower water with inertia is told still: it has no arrow.
 */
export const SLOWEST_TOLD_SPEED = CELL_METRES / SPEED_UNITS;
/** A water the server tells slower than this, in cells a second, is at rest. */
export const FLOW_REST_SPEED = 0.1;
/** Ground this much lower than the surface of the water next to it is a drop: the water runs down there. */
const DROP_PX = 1;

/** The flow of the water at a place: which way it runs (a vector of length 1, or 0,0 at rest) and how fast. */
export interface WaterFlow {
    x: number;
    y: number;
    /** Metres a second. */
    speed: number;
    /** Pixels of water there. */
    depth: number;
    /** How fast the level changes between the two last states, in pixels a second: positive when it rises. */
    rate: number;
    /** How fast it rises over a few seconds, the waves left out (WaterTrend), in pixels a second. */
    trend: number;
    /** Whether that shows as a rise (1), a fall (-1), or neither (0): a sea that only ripples is neither. */
    tint: number;
}

const STILL: WaterFlow = { x: 0, y: 0, speed: 0, depth: 0, rate: 0, trend: 0, tint: 0 };

function depthOf(water: SettledWater, cellX: number, cellY: number, from: Float32Array): number {
    const column = cellX - water.x;
    const row = cellY - water.y;
    if (column < 0 || row < 0 || column >= water.width || row >= water.height) return 0;
    return from[row * water.width + column];
}

/**
 * The flow of the water over a cell of the relief, read from what this browser knows: the depths the server sent.
 * The water runs down the slope of its surface (ground and water), as fast as the model of the map makes it run
 * (`inertia`: the water with inertia, held back by the friction of the soil of the cell and by the `waves` of the
 * map; else the water that creeps). A dry neighbour is a shore, not a slope, unless its ground is lower than the
 * water: then the water falls there. Still under a film, or where the surface is level.
 */
export function flowAtCell(
    water: SettledWater,
    terrain: TerrainData | undefined,
    cellX: number,
    cellY: number,
    inertia: boolean,
    waves?: WaveSettings,
): WaterFlow {
    const depth = depthOf(water, cellX, cellY, water.depths);
    if (depth < FLOW_MIN_DEPTH_PX) return STILL;
    const earlier = depthOf(water, cellX, cellY, water.before);
    const rate = Number.isFinite(water.seconds) && water.seconds > 0 ? (depth - earlier) / water.seconds : 0;
    const { trend, tint } = trendAtCell(water, cellX, cellY, rate);
    const here = heightAt(terrain, cellX, cellY) + depth;
    const surface = (awayX: number, awayY: number): number => {
        const held = depthOf(water, cellX + awayX, cellY + awayY, water.depths);
        const ground = heightAt(terrain, cellX + awayX, cellY + awayY);
        if (held >= FLOW_MIN_DEPTH_PX) return ground + held;
        return ground < here - DROP_PX ? ground + held : here;
    };
    // The server tells how fast this water runs (the water with inertia): shown as it is, a wave going by included.
    const known = water.speedAt?.(cellX, cellY);
    if (known) {
        const speed = Math.hypot(known.x, known.y);
        if (speed < FLOW_REST_SPEED) return { x: 0, y: 0, speed: 0, depth, rate, trend, tint };
        return { x: known.x / speed, y: known.y / speed, speed: speed * CELL_METRES, depth, rate, trend, tint };
    }
    const slopeX = (surface(1, 0) - surface(-1, 0)) / 2;
    const slopeY = (surface(0, 1) - surface(0, -1)) / 2;
    const slope = Math.hypot(slopeX, slopeY);
    if (slope < FLOW_REST_SLOPE) return { x: 0, y: 0, speed: 0, depth, rate, trend, tint };
    return {
        x: -slopeX / slope || 0,
        y: -slopeY / slope || 0,
        speed:
            steadyFlowSpeed(slope, depth, inertia, waves, soilRoughness(soilAt(terrain, cellX, cellY))) * CELL_METRES,
        depth,
        rate,
        trend,
        tint,
    };
}

/**
 * The trend of the level of a cell and whether it shows (WaterTrend); when the water keeps none, the rate between
 * the two last states, shown from the same threshold.
 */
function trendAtCell(water: SettledWater, cellX: number, cellY: number, rate: number): { trend: number; tint: number } {
    const index = (cellY - water.y) * water.width + (cellX - water.x);
    if (water.trend && water.trendShown && index < water.trend.length) {
        return { trend: water.trend[index], tint: water.trendShown[index] };
    }
    return { trend: rate, tint: Math.abs(rate) >= STEADY_PX_PER_SECOND ? Math.sign(rate) : 0 };
}

/**
 * The flow over a block of `size` cells a side whose corner is the cell `cellX`, `cellY`: the mean of a few of its
 * cells (its middle, and its four quarters when it is large), the dry ones left out. Seen from far, one arrow
 * stands for many cells.
 */
export function flowOverBlock(
    water: SettledWater,
    terrain: TerrainData | undefined,
    cellX: number,
    cellY: number,
    size: number,
    inertia: boolean,
    waves?: WaveSettings,
): WaterFlow {
    if (size <= 1) return flowAtCell(water, terrain, cellX, cellY, inertia, waves);
    const half = Math.floor(size / 2);
    const quarter = Math.floor(size / 4);
    const places =
        size >= 4
            ? [
                  [half, half],
                  [quarter, quarter],
                  [size - 1 - quarter, quarter],
                  [quarter, size - 1 - quarter],
                  [size - 1 - quarter, size - 1 - quarter],
              ]
            : [[half, half]];
    let wet = 0;
    let x = 0;
    let y = 0;
    let depth = 0;
    let rate = 0;
    let trend = 0;
    let tint = 0;
    for (const [awayX, awayY] of places) {
        const flow = flowAtCell(water, terrain, cellX + awayX, cellY + awayY, inertia, waves);
        if (flow.depth <= 0) continue;
        wet++;
        x += flow.x * flow.speed;
        y += flow.y * flow.speed;
        depth += flow.depth;
        rate += flow.rate;
        trend += flow.trend;
        tint += flow.tint;
    }
    if (wet === 0) return STILL;
    const speed = Math.hypot(x, y) / wet;
    const length = Math.hypot(x, y);
    return {
        x: length > 0 ? x / length : 0,
        y: length > 0 ? y / length : 0,
        speed,
        depth: depth / wet,
        rate: rate / wet,
        trend: trend / wet,
        // The block rises where most of its cells that show anything rise.
        tint: Math.sign(tint),
    };
}

/** The colours of the speed of the water, from still to fast: metres a second and colour. */
export const FLOW_SPEED_SCALE: readonly { speed: number; color: number }[] = [
    { speed: 0, color: 0xe0f2fe },
    { speed: 0.5, color: 0xa3e635 },
    { speed: 1.5, color: 0xfacc15 },
    { speed: 3, color: 0xef4444 },
];

/** The colour of a speed (metres a second) on the scale: the last one beyond its end. */
export function flowSpeedColor(speed: number): number {
    const scale = FLOW_SPEED_SCALE;
    if (!(speed > scale[0].speed)) return scale[0].color;
    for (let index = 1; index < scale.length; index++) {
        const to = scale[index];
        if (speed > to.speed) continue;
        const from = scale[index - 1];
        const share = (speed - from.speed) / (to.speed - from.speed);
        const mix = (shift: number): number =>
            Math.round(
                ((from.color >> shift) & 255) + (((to.color >> shift) & 255) - ((from.color >> shift) & 255)) * share,
            );
        return (mix(16) << 16) | (mix(8) << 8) | mix(0);
    }
    return scale[scale.length - 1].color;
}
