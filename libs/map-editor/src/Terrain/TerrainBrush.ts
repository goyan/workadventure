import { TERRAIN_CELL, TILE_PX } from "../types";
import type { TerrainData } from "../types";
import { cellKey, cellOf, heightAt } from "./TerrainGrid";

/** The brush of the relief: a sphere pressed into the ground (dig) or the same shape put back (fill). */
export interface BrushSettings {
    /** Diameter of the sphere, in tiles. */
    diameterTiles: number;
    /** Thickness taken off (or put back) under the centre of the sphere by one stroke, in pixels of altitude. */
    forcePx: number;
    /** How deep the map may be dug, in tiles. */
    maxDepthTiles: number;
    mode: "dig" | "fill";
}

/** The force of a brush left on automatic: an eighth of its diameter. */
export function defaultForcePx(diameterTiles: number): number {
    return (diameterTiles * TILE_PX) / 8;
}

/** The thickness the sphere takes off the ground this far from its centre: all of the force there, nothing at its rim. */
export function capThickness(distancePx: number, radiusPx: number, forcePx: number): number {
    if (!(distancePx < radiusPx)) return 0;
    return forcePx * (1 - (distancePx / radiusPx) ** 2);
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
                const thickness = capThickness(distance, radius, settings.forcePx);
                if (thickness <= 0) continue;
                const key = cellKey(cellX, cellY);
                if (thickness > (thickest.get(key) ?? 0)) thickest.set(key, thickness);
            }
        }
    }
    const floor = -settings.maxDepthTiles * TILE_PX;
    for (const [key, thickness] of thickest) {
        const { x, y } = cellOf(key);
        if (!allowed(x, y)) continue;
        const current = heightAt(terrain, x, y);
        const next =
            settings.mode === "dig"
                ? // What is already deeper than the maximum stays as it is.
                  Math.min(current, Math.max(floor, Math.round(current - thickness)))
                : Math.min(0, Math.round(current + thickness));
        if (next !== current) changes.set(key, next);
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
