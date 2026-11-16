import type { FloorFamily, WallHeight, WallTint } from "./MapLayerCatalog";

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
    /** In tiles, 1 to 4. */
    height: WallHeight;
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
    /**
     * Height of a horizontal door, at most the one of its walls; 1 when absent. A vertical door is seen from above: the
     * model always gives it the height 1.
     */
    height?: WallHeight;
}

/** The height of a door, 1 when it does not tell. */
export function doorHeight(door: DoorRef): WallHeight {
    return door.height ?? 1;
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
    /** Horizontal wall segments drawn as a window. The wall stays in the model under it, like under a door. */
    private readonly windows = new Map<string, WallEdgeRef>();
    /** Height of each window, by the key of its segment: at most the one of its wall. */
    private readonly windowHeights = new Map<string, WallHeight>();

    public clone(): MapLayerModel {
        const copy = new MapLayerModel();
        for (const floor of this.floors.values()) copy.setFloor(floor.x, floor.y, floor.family);
        for (const wall of this.walls.values()) copy.setWall(wall.orientation, wall.x, wall.y, wall.tint, wall.height);
        for (const door of this.doors.values()) copy.doors.set(edgeKey(door.orientation, door.x, door.y), { ...door });
        for (const pane of this.windows.values()) copy.windows.set(edgeKey("h", pane.x, pane.y), pane);
        for (const [key, height] of this.windowHeights) copy.windowHeights.set(key, height);
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

    /**
     * Sets a wall segment, replacing the one that was there. A door or a window of the segment higher than the new wall
     * is brought down to its height.
     */
    public setWall(orientation: WallOrientation, x: number, y: number, tint: WallTint, height: WallHeight = 1): void {
        this.walls.set(edgeKey(orientation, x, y), { orientation, x, y, tint, height });
        const door = this.getDoorOn(orientation, x, y);
        if (door && doorHeight(door) > height) {
            door.height = height;
        }
        const windowHeight = orientation === "h" ? this.windowHeights.get(edgeKey("h", x, y)) : undefined;
        if (windowHeight !== undefined && windowHeight > height) {
            this.windowHeights.set(edgeKey("h", x, y), height);
        }
    }

    /** Removing a wall segment also removes the door or the window that stands on it. */
    public removeWall(orientation: WallOrientation, x: number, y: number): boolean {
        this.removeDoor(this.getDoorOn(orientation, x, y));
        if (orientation === "h") this.removeWindow(x, y);
        return this.walls.delete(edgeKey(orientation, x, y));
    }

    /** Whether a door can be set here: walls on both segments and no door or window already on one of them. */
    public canSetDoor(door: DoorRef): boolean {
        return doorEdges(door).every(
            (edge) =>
                this.hasWall(edge.orientation, edge.x, edge.y) &&
                this.getDoorOn(edge.orientation, edge.x, edge.y) === undefined &&
                !(edge.orientation === "h" && this.hasWindow(edge.x, edge.y)),
        );
    }

    /** Whether a window can be set on the horizontal segment (x, y): a wall, and no door nor window on it yet. */
    public canSetWindow(x: number, y: number): boolean {
        return this.hasWall("h", x, y) && this.getDoorOn("h", x, y) === undefined && !this.hasWindow(x, y);
    }

    /** Sets a window of the given height, brought down to the height of its wall. */
    public setWindow(x: number, y: number, height: WallHeight = 1): boolean {
        const wall = this.getWall("h", x, y);
        if (!wall || !this.canSetWindow(x, y)) {
            return false;
        }
        this.windows.set(edgeKey("h", x, y), { orientation: "h", x, y });
        this.windowHeights.set(edgeKey("h", x, y), height > wall.height ? wall.height : height);
        return true;
    }

    /** Changes the height of the window of the segment (x, y), brought down to the height of its wall. */
    public setWindowHeight(x: number, y: number, height: WallHeight): boolean {
        const wall = this.getWall("h", x, y);
        if (!wall || !this.hasWindow(x, y)) return false;
        this.windowHeights.set(edgeKey("h", x, y), height > wall.height ? wall.height : height);
        return true;
    }

    public removeWindow(x: number, y: number): boolean {
        this.windowHeights.delete(edgeKey("h", x, y));
        return this.windows.delete(edgeKey("h", x, y));
    }

    /** Height of the window of the horizontal segment (x, y); undefined without a window. */
    public getWindowHeight(x: number, y: number): WallHeight | undefined {
        return this.windowHeights.get(edgeKey("h", x, y));
    }

    public hasWindow(x: number, y: number): boolean {
        return this.windows.has(edgeKey("h", x, y));
    }

    public getWindows(): IterableIterator<WallEdgeRef> {
        return this.windows.values();
    }

    /** Sets a door; a horizontal door is brought down to the height of the lower of its two walls. */
    public setDoor(door: DoorRef): boolean {
        if (!this.canSetDoor(door)) {
            return false;
        }
        let height: WallHeight = 1;
        if (door.orientation === "h") {
            const wallHeight = this.lowerWallOf(door);
            height = doorHeight(door) > wallHeight ? wallHeight : doorHeight(door);
        }
        this.doors.set(edgeKey(door.orientation, door.x, door.y), {
            orientation: door.orientation,
            x: door.x,
            y: door.y,
            height,
        });
        return true;
    }

    /**
     * Changes the height of the horizontal door centered on the vertex of `door`, brought down to the height of the lower
     * of its walls. A vertical door has no height.
     */
    public setDoorHeight(door: DoorRef, height: WallHeight): boolean {
        const placed = this.doors.get(edgeKey(door.orientation, door.x, door.y));
        if (!placed || placed.orientation !== "h") return false;
        const wallHeight = this.lowerWallOf(placed);
        placed.height = height > wallHeight ? wallHeight : height;
        return true;
    }

    /** Height of the lower of the two walls a door stands on. */
    public lowerWallOf(door: DoorRef): WallHeight {
        let lowest: WallHeight = 4;
        for (const edge of doorEdges(door)) {
            const wallHeight = this.getWall(edge.orientation, edge.x, edge.y)?.height ?? 1;
            if (wallHeight < lowest) lowest = wallHeight;
        }
        return lowest;
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
