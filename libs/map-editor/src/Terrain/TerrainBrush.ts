import { TERRAIN_CELL, TILE_PX } from "../types";
import type { TerrainData } from "../types";
import { cellKey, cellOf, heightAt } from "./TerrainGrid";

/** The brush of the relief: a sphere pressed into the ground (dig) or the same shape put back (fill). */
export interface BrushSettings {
    /** Diameter of the sphere, in tiles. */
    diameterTiles: number;
    /** Thickness taken off (or put back) under the centre of the sphere by one stroke, in pixels of altitude. */
    forcePx: number;
    /** How deep the map may be dug, and how high it may be raised, in tiles. */
    maxDepthTiles: number;
    /**
     * dig and fill take off or put back a cap, fill up to the ground only; raise adds a cap, over the ground too (a
     * mount); flatten brings the ground towards `targetPx`; smooth brings each cell
     * towards the mean of its neighbours.
     */
    mode: "dig" | "fill" | "raise" | "flatten" | "smooth";
    /** The height the flatten mode brings the ground to, in pixels of altitude (0 the ground, negative under it, positive over it). */
    targetPx?: number;
}

/** The force at which the smooth mode brings a cell all the way to the mean of its neighbours in one stroke. */
export const FULL_SMOOTH_FORCE_PX = 32;

/** The force of a brush left on automatic: an eighth of its diameter. */
export function defaultForcePx(diameterTiles: number): number {
    return (diameterTiles * TILE_PX) / 8;
}

/** The thickness the sphere takes off the ground this far from its centre: all of the force there, nothing at its rim. */
export function capThickness(distancePx: number, radiusPx: number, forcePx: number): number {
    if (!(distancePx < radiusPx)) return 0;
    return forcePx * (1 - (distancePx / radiusPx) ** 2);
}

/**
 * How much of the force the flatten and smooth modes apply this far from the centre of the brush: all of it over the
 * middle of the disc (so that a bottom comes out flat), down to nothing at its rim (so that its bank is a slope).
 */
export function discWeight(distancePx: number, radiusPx: number): number {
    if (!(distancePx < radiusPx)) return 0;
    return Math.min(1, 2 * (1 - (distancePx / radiusPx) ** 2));
}

/** The mean height of a cell and its eight neighbours. */
function meanAround(terrain: TerrainData | undefined, cellX: number, cellY: number): number {
    let sum = 0;
    for (let y = cellY - 1; y <= cellY + 1; y++) {
        for (let x = cellX - 1; x <= cellX + 1; x++) sum += heightAt(terrain, x, y);
    }
    return sum / 9;
}

/** The most cells one command may change: the changes of a longer stroke are sent in several (chunkedChanges). */
export const MAX_STROKE_CELLS = 20000;

function usable(settings: BrushSettings): boolean {
    return (
        Number.isFinite(settings.diameterTiles) &&
        settings.diameterTiles > 0 &&
        Number.isFinite(settings.forcePx) &&
        settings.forcePx > 0 &&
        Number.isFinite(settings.maxDepthTiles)
    );
}

/** The points of a path, with points added so that no two are further apart than half a cell. */
function sampled(path: readonly { x: number; y: number }[]): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    path.forEach((point, index) => {
        if (index > 0) {
            const from = path[index - 1];
            const steps = Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / (TERRAIN_CELL / 2));
            for (let step = 1; step < steps; step++) {
                points.push({
                    x: from.x + ((point.x - from.x) * step) / steps,
                    y: from.y + ((point.y - from.y) * step) / steps,
                });
            }
        }
        points.push(point);
    });
    return points;
}

/**
 * The new heights (by cell key) of the cells one stroke of the brush changes, along a path in map pixels. A cell takes
 * the thickest cap it got during the stroke, once: holding the brush still digs no further, a new stroke does, down
 * to the maximum depth of the map. `allowed` says which cells may be dug (outdoors, not under a wall).
 */
export function strokeChanges(
    terrain: TerrainData | undefined,
    path: readonly { x: number; y: number }[],
    settings: BrushSettings,
    allowed: (cellX: number, cellY: number) => boolean,
): Map<string, number> {
    const changes = new Map<string, number>();
    if (!usable(settings)) return changes;
    const radius = (settings.diameterTiles * TILE_PX) / 2;
    const shaped = settings.mode === "flatten" || settings.mode === "smooth";
    if (settings.mode === "flatten" && !Number.isFinite(settings.targetPx)) return changes;
    const thickest = new Map<string, number>();
    let lastCell: string | undefined;
    for (const point of sampled(path)) {
        // A point in the same cell as the one before digs the same cells within a pixel or so: skipped.
        const here = cellKey(Math.floor(point.x / TERRAIN_CELL), Math.floor(point.y / TERRAIN_CELL));
        if (here === lastCell) continue;
        lastCell = here;
        const centre = cellOf(here);
        const centreX = (centre.x + 0.5) * TERRAIN_CELL;
        const centreY = (centre.y + 0.5) * TERRAIN_CELL;
        const reach = Math.ceil(radius / TERRAIN_CELL);
        for (let cellY = centre.y - reach; cellY <= centre.y + reach; cellY++) {
            for (let cellX = centre.x - reach; cellX <= centre.x + reach; cellX++) {
                const distance = Math.hypot(
                    (cellX + 0.5) * TERRAIN_CELL - centreX,
                    (cellY + 0.5) * TERRAIN_CELL - centreY,
                );
                const thickness = shaped
                    ? settings.forcePx * discWeight(distance, radius)
                    : capThickness(distance, radius, settings.forcePx);
                if (thickness <= 0) continue;
                const key = cellKey(cellX, cellY);
                if (thickness > (thickest.get(key) ?? 0)) thickest.set(key, thickness);
            }
        }
    }
    const floor = -settings.maxDepthTiles * TILE_PX;
    const ceiling = settings.maxDepthTiles * TILE_PX;
    for (const [key, thickness] of thickest) {
        const { x, y } = cellOf(key);
        if (!allowed(x, y)) continue;
        const current = heightAt(terrain, x, y);
        let next: number;
        if (settings.mode === "dig") {
            // What is already deeper than the maximum stays as it is.
            next = Math.min(current, Math.max(floor, Math.round(current - thickness)));
        } else if (settings.mode === "fill") {
            // What is already over the ground stays as it is.
            next = Math.max(current, Math.min(0, Math.round(current + thickness)));
        } else if (settings.mode === "raise") {
            // What is already higher than the maximum stays as it is.
            next = Math.max(current, Math.min(ceiling, Math.round(current + thickness)));
        } else if (settings.mode === "flatten") {
            const target = Math.min(ceiling, Math.max(floor, settings.targetPx ?? 0));
            next =
                current > target
                    ? Math.max(target, Math.round(current - thickness))
                    : // What is deeper than the level asked (and than the maximum, even) is filled up to it.
                      Math.min(target, Math.round(current + thickness));
        } else {
            const blend = Math.min(1, thickness / FULL_SMOOTH_FORCE_PX);
            next = Math.round(current + (meanAround(terrain, x, y) - current) * blend);
            // Smoothing digs no deeper than the map allows: the rim of a hollow at its maximum is left as it is.
            if (next < current) next = Math.min(current, Math.max(floor, next));
            else next = Math.max(current, Math.min(ceiling, next));
        }
        if (next !== current) changes.set(key, next === 0 ? 0 : next);
    }
    return changes;
}

/**
 * The changes of a stroke cut into parts of MAX_STROKE_CELLS cells at most, so the longest drag is sent in commands
 * of a bounded size, none refused. The stroke itself is worked out as a whole: a cell is dug once, also where two
 * parts meet.
 */
export function chunkedChanges(changes: ReadonlyMap<string, number>): Map<string, number>[] {
    const parts: Map<string, number>[] = [];
    let part = new Map<string, number>();
    for (const [key, height] of changes) {
        if (part.size >= MAX_STROKE_CELLS) {
            parts.push(part);
            part = new Map();
        }
        part.set(key, height);
    }
    if (part.size > 0) parts.push(part);
    return parts;
}
