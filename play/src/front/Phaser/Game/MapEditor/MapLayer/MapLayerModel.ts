import type { FloorFamily, WallTint } from "./MapLayerCatalog";

export type WallOrientation = "h" | "v";

/**
 * A wall segment lies on the grid line, between two vertices.
 * - horizontal edge (x, y): on the line y, spanning the column x (from vertex (x, y) to vertex (x + 1, y));
 * - vertical edge (x, y): on the line x, spanning the row y (from vertex (x, y) to vertex (x, y + 1)).
 */
export interface WallEdge {
    orientation: WallOrientation;
    x: number;
    y: number;
    tint: WallTint;
}

export interface FloorCell {
    x: number;
    y: number;
    family: FloorFamily;
}

export function cellKey(x: number, y: number): string {
    return `${x},${y}`;
}

export function edgeKey(orientation: WallOrientation, x: number, y: number): string {
    return `${orientation}:${x},${y}`;
}

/**
 * What the map layer means, independent of the sprites that draw it.
 * The autotiler derives the sprites from this model, and generators (for example a room outline tracer)
 * only have to fill it.
 */
export class MapLayerModel {
    private readonly floors = new Map<string, FloorCell>();
    private readonly walls = new Map<string, WallEdge>();

    public clone(): MapLayerModel {
        const copy = new MapLayerModel();
        for (const floor of this.floors.values()) copy.setFloor(floor.x, floor.y, floor.family);
        for (const wall of this.walls.values()) copy.setWall(wall.orientation, wall.x, wall.y, wall.tint);
        return copy;
    }

    public setFloor(x: number, y: number, family: FloorFamily): void {
        this.floors.set(cellKey(x, y), { x, y, family });
    }

    public removeFloor(x: number, y: number): boolean {
        return this.floors.delete(cellKey(x, y));
    }

    public getFloor(x: number, y: number): FloorCell | undefined {
        return this.floors.get(cellKey(x, y));
    }

    public setWall(orientation: WallOrientation, x: number, y: number, tint: WallTint): void {
        this.walls.set(edgeKey(orientation, x, y), { orientation, x, y, tint });
    }

    public removeWall(orientation: WallOrientation, x: number, y: number): boolean {
        return this.walls.delete(edgeKey(orientation, x, y));
    }

    public getWall(orientation: WallOrientation, x: number, y: number): WallEdge | undefined {
        return this.walls.get(edgeKey(orientation, x, y));
    }

    public hasWall(orientation: WallOrientation, x: number, y: number): boolean {
        return this.walls.has(edgeKey(orientation, x, y));
    }

    public getFloors(): IterableIterator<FloorCell> {
        return this.floors.values();
    }

    public getWalls(): IterableIterator<WallEdge> {
        return this.walls.values();
    }
}
