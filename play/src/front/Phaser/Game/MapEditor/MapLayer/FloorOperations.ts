import { MAP_LAYER_TILE_SIZE, mapLayerPrefabId } from "./MapLayerCatalog";
import type { FloorFamily } from "./MapLayerCatalog";
import { slabImagePosition, stairImagePosition } from "./FloorModel";
import type { FloorModel, PlacedStair } from "./FloorModel";
import {
    FLOOR_WALL_HEIGHTS,
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    STAIR_RISES,
    floorElevation,
    slabPrefabName,
    stairGroundBox,
    stairPrefabName,
} from "./MapLayerFloors";
import type { StairRise, StairShape, TilePoint } from "./MapLayerFloors";
import type { MapBounds } from "./MapLayerOperations";

/** One entity the floors need: a slab or a stair, at the position of its image, with the altitude it stands at. */
export interface FloorPlacement {
    key: string;
    collectionName: string;
    prefabId: string;
    x: number;
    y: number;
    elevation: number;
}

export function floorPlacementKey(prefabId: string, x: number, y: number, elevation: number): string {
    return JSON.stringify([prefabId, x, y, elevation]);
}

function placement(name: string, position: { x: number; y: number }, elevation: number): FloorPlacement {
    const prefabId = mapLayerPrefabId(MAP_LAYER_FLOOR_SLAB_COLLECTION, name);
    return {
        key: floorPlacementKey(prefabId, position.x, position.y, elevation),
        collectionName: MAP_LAYER_FLOOR_SLAB_COLLECTION,
        prefabId,
        x: position.x,
        y: position.y,
        elevation,
    };
}

/** The entities that draw the floors of a model: one per slab, one per stair (it stands on the floor it starts from). */
export function computeFloorPlacements(model: FloorModel): FloorPlacement[] {
    return [
        ...model
            .getSlabs()
            .map((slab) =>
                placement(slabPrefabName(slab.family), slabImagePosition(slab, slab.elevation), slab.elevation),
            ),
        ...model
            .getStairs()
            .map((stair) =>
                placement(
                    stairPrefabName(stair.shape),
                    stairImagePosition(stair.shape, stair.foot, stair.base),
                    stair.base,
                ),
            ),
    ];
}

export interface PlacedFloorEntity {
    entityId: string;
    key: string;
}

/** Entities to remove and to create so that the placed entities match the wanted placements, nothing more. */
export function diffFloorPlacements(
    placed: readonly PlacedFloorEntity[],
    wanted: readonly FloorPlacement[],
): { toDelete: string[]; toCreate: FloorPlacement[] } {
    const wantedKeys = new Set(wanted.map((item) => item.key));
    const kept = new Set<string>();
    const toDelete: string[] = [];
    for (const entity of placed) {
        if (wantedKeys.has(entity.key) && !kept.has(entity.key)) kept.add(entity.key);
        else toDelete.push(entity.entityId);
    }
    return { toDelete, toCreate: wanted.filter((item) => !kept.has(item.key)) };
}

/** The tile under a point of the screen, for a floor at this altitude: the point is over the ground further south. */
export function floorCellAt(worldX: number, worldY: number, level: number): TilePoint {
    return {
        x: Math.floor(worldX / MAP_LAYER_TILE_SIZE),
        y: Math.floor((worldY + level) / MAP_LAYER_TILE_SIZE),
    };
}

/** The highest floor that has a slab drawn under a point of the screen; 0 (the ground) when there is none. */
export function levelUnderPoint(model: FloorModel, worldX: number, worldY: number): number {
    const levels = model.getLevels();
    for (let i = levels.length - 1; i >= 0; i--) {
        const cell = floorCellAt(worldX, worldY, levels[i]);
        if (model.hasSlab(levels[i], cell.x, cell.y)) return levels[i];
    }
    return 0;
}

function rectangle(a: TilePoint, b: TilePoint): TilePoint[] {
    const cells: TilePoint[] = [];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
        for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) cells.push({ x, y });
    }
    return cells;
}

function inBounds(cell: TilePoint, bounds: MapBounds): boolean {
    return cell.x >= 0 && cell.y >= 0 && cell.x < bounds.columns && cell.y < bounds.rows;
}

function stairCells(shape: StairShape, foot: TilePoint): TilePoint[] {
    const size = MAP_LAYER_TILE_SIZE;
    const box = stairGroundBox(shape, foot);
    return rectangle(
        { x: box.x / size, y: box.y / size },
        { x: (box.x + box.width) / size - 1, y: (box.y + box.height) / size - 1 },
    );
}

function covers(stair: PlacedStair, cell: TilePoint): boolean {
    return stairCells(stair.shape, stair.foot).some((covered) => covered.x === cell.x && covered.y === cell.y);
}

/**
 * Lays slabs over a rectangle of tiles of a floor, inside the map. The well of a stair that reaches this floor stays
 * open: no slab over the stair.
 */
export function applySlabs(
    model: FloorModel,
    level: number,
    a: TilePoint,
    b: TilePoint,
    family: FloorFamily,
    bounds: MapBounds,
): void {
    if (level <= 0) return;
    const wells = model.getStairs().filter((stair) => stair.top === level);
    for (const cell of rectangle(a, b)) {
        if (!inBounds(cell, bounds) || wells.some((stair) => covers(stair, cell))) continue;
        model.setSlab(level, cell.x, cell.y, family);
    }
}

export function eraseSlabs(model: FloorModel, level: number, a: TilePoint, b: TilePoint): void {
    for (const cell of rectangle(a, b)) model.removeSlab(level, cell.x, cell.y);
}

/** Whether a stair fits: inside the map, and not over another stair that starts from the same floor. */
export function canPlaceStair(
    model: FloorModel,
    shape: StairShape,
    foot: TilePoint,
    base: number,
    bounds: MapBounds,
): boolean {
    const cells = stairCells(shape, foot);
    if (!cells.every((cell) => inBounds(cell, bounds))) return false;
    return !model.getStairs().some((stair) => stair.base === base && cells.some((cell) => covers(stair, cell)));
}

/** Places a stair and cuts its well in the floor it reaches: the slabs over it are removed. */
export function placeStair(
    model: FloorModel,
    shape: StairShape,
    foot: TilePoint,
    base: number,
    bounds: MapBounds,
): boolean {
    if (!canPlaceStair(model, shape, foot, base, bounds)) return false;
    const stair = model.addStair(shape, foot, base);
    for (const cell of stairCells(shape, foot)) model.removeSlab(stair.top, cell.x, cell.y);
    return true;
}

/**
 * Removes the stair that starts from this floor and covers this tile. Its well is closed with the floor around it: a
 * tile of the well gets the slab of a neighbour, when the floor reaches it.
 */
export function removeStairAt(model: FloorModel, level: number, cell: TilePoint): boolean {
    const stair = model.getStairs().find((candidate) => candidate.base === level && covers(candidate, cell));
    if (!stair) return false;
    model.removeStair(stair);
    const well = stairCells(stair.shape, stair.foot);
    const around = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
    ];
    let family: FloorFamily | undefined;
    for (const covered of well) {
        for (const step of around) {
            family ??= model.slabAt(stair.top, covered.x + step.x, covered.y + step.y);
        }
    }
    if (family) for (const covered of well) model.setSlab(stair.top, covered.x, covered.y, family);
    return true;
}

/**
 * The floors the editor offers above the ground: the ones on the walls of 2, 3 and 4 tiles, and the ones already on
 * the map.
 */
export function availableLevels(model: FloorModel): number[] {
    const levels = new Set<number>(FLOOR_WALL_HEIGHTS.map((height) => floorElevation(height)));
    for (const level of model.getLevels()) levels.add(level);
    return [...levels].sort((a, b) => a - b);
}

/** Among floors, the ones a stair can reach from a floor: the ones as much higher as a stair goes up. */
export function reachableLevels(from: number, levels: readonly number[]): number[] {
    return levels.filter((level) => STAIR_RISES.some((rise) => from + rise === level));
}

/** How much a stair goes up from a floor to another; undefined when no stair does. */
export function stairRiseBetween(from: number, to: number): StairRise | undefined {
    return STAIR_RISES.find((rise) => from + rise === to);
}

/**
 * The floor a new stair goes up to, among the ones in reach: the one asked when it is in reach; otherwise the lowest
 * one that already has slabs (a stair to a floor without slabs leads nowhere), or else the lowest one.
 */
export function stairTarget(
    reachable: readonly number[],
    built: readonly number[],
    asked: number | undefined,
): number | undefined {
    if (asked !== undefined && reachable.includes(asked)) return asked;
    return reachable.find((level) => built.includes(level)) ?? reachable[0];
}

/**
 * The tiles one steps onto at the top of a stair, on the floor it reaches: the ones just beyond its top end, across
 * its width.
 */
export function stairArrivalCells(stair: PlacedStair): TilePoint[] {
    const size = MAP_LAYER_TILE_SIZE;
    const g = stair.ground;
    const direction = stair.shape.direction;
    const cells: TilePoint[] = [];
    if (direction === "n" || direction === "s") {
        const y = direction === "n" ? g.y / size - 1 : (g.y + g.height) / size;
        for (let x = g.x / size; x < (g.x + g.width) / size; x++) cells.push({ x, y });
    } else {
        const x = direction === "e" ? (g.x + g.width) / size : g.x / size - 1;
        for (let y = g.y / size; y < (g.y + g.height) / size; y++) cells.push({ x, y });
    }
    return cells;
}

/** Whether a stair leads somewhere: the floor it reaches has a slab on one of the tiles of its top. */
export function stairHasArrival(model: FloorModel, stair: PlacedStair): boolean {
    return stairArrivalCells(stair).some((cell) => model.hasSlab(stair.top, cell.x, cell.y));
}

/**
 * The level one step above (`delta` 1) or below (-1) a level, among the ground and the floors offered, lowest first;
 * it stops at the ends.
 */
export function stepLevel(levels: readonly number[], current: number, delta: 1 | -1): number {
    const all = [0, ...levels];
    const index = Math.max(0, all.indexOf(current));
    return all[Math.min(all.length - 1, Math.max(0, index + delta))];
}
