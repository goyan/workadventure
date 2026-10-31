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

/**
 * A door replaces two consecutive wall segments of the same orientation. It is identified by the vertex between them:
 * - horizontal door (x, y): segments (x - 1, y) and (x, y);
 * - vertical door (x, y): segments (x, y - 1) and (x, y).
 * The walls stay in the model under the door, so that removing the door gives the wall back as it was.
 */
export interface DoorRef {
    orientation: WallOrientation;
    x: number;
    y: number;
}

/** The two wall segments a door stands on, first one first. */
export function doorEdges(door: DoorRef): [WallEdgeRef, WallEdgeRef] {
    return door.orientation === "h"
        ? [
              { orientation: "h", x: door.x - 1, y: door.y },
              { orientation: "h", x: door.x, y: door.y },
          ]
        : [
              { orientation: "v", x: door.x, y: door.y - 1 },
              { orientation: "v", x: door.x, y: door.y },
          ];
}

export interface WallEdgeRef {
    orientation: WallOrientation;
    x: number;
    y: number;
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
    private readonly doors = new Map<string, DoorRef>();

    public clone(): MapLayerModel {
        const copy = new MapLayerModel();
        for (const door of this.doors.values()) copy.doors.set(edgeKey(door.orientation, door.x, door.y), door);
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

    /** Removing a wall segment also removes the door that stands on it. */
    public removeWall(orientation: WallOrientation, x: number, y: number): boolean {
        this.removeDoor(this.getDoorOn(orientation, x, y));
        return this.walls.delete(edgeKey(orientation, x, y));
    }

    /** Whether a door can be set here: walls on both segments and no door already on one of them. */
    public canSetDoor(door: DoorRef): boolean {
        return doorEdges(door).every(
            (edge) =>
                this.hasWall(edge.orientation, edge.x, edge.y) &&
                this.getDoorOn(edge.orientation, edge.x, edge.y) === undefined,
        );
    }

    public setDoor(door: DoorRef): boolean {
        if (!this.canSetDoor(door)) {
            return false;
        }
        this.doors.set(edgeKey(door.orientation, door.x, door.y), { ...door });
        return true;
    }

    public removeDoor(door: DoorRef | undefined): void {
        if (door) {
            this.doors.delete(edgeKey(door.orientation, door.x, door.y));
        }
    }

    /** The door that stands on a wall segment, if any. */
    public getDoorOn(orientation: WallOrientation, x: number, y: number): DoorRef | undefined {
        const next = orientation === "h" ? { x: x + 1, y } : { x, y: y + 1 };
        return this.doors.get(edgeKey(orientation, x, y)) ?? this.doors.get(edgeKey(orientation, next.x, next.y));
    }

    /** Whether a door is centered on this vertex. */
    public hasDoorAt(orientation: WallOrientation, x: number, y: number): boolean {
        return this.doors.has(edgeKey(orientation, x, y));
    }

    public getDoors(): IterableIterator<DoorRef> {
        return this.doors.values();
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
