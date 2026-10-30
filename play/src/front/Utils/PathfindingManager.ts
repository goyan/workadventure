import { MathUtils } from "@workadventure/math-utils";
import { CHARACTER_BODY_HEIGHT, CHARACTER_BODY_OFFSET_X, CHARACTER_BODY_OFFSET_Y } from "../Phaser/Entity/Character";
import { MinHeap } from "./MinHeap";
import { TileBarriers } from "./TileBarriers";

export enum PathTileType {
    Walkable = 0,
    Collider = 1,
    Exit = 2,
    Start = 3,
    MeetingRoom = 4,
    PersonalDesk = 5,
}

/** The types of tile the avatar can walk on. */
const WALKABLE_TILE_TYPES: ReadonlySet<number> = new Set([
    PathTileType.Walkable,
    PathTileType.Exit,
    PathTileType.Start,
    PathTileType.MeetingRoom,
    PathTileType.PersonalDesk,
]);

/** Cost of entering a tile, to walk around the tiles that are better avoided. */
const TILE_COST: Readonly<Record<number, number>> = {
    [PathTileType.Exit]: 100,
    [PathTileType.MeetingRoom]: 50,
    [PathTileType.PersonalDesk]: 50,
};

const DIAGONAL_COST = 1.4;

/** Distance between two points checked along a straight line, smaller than a wall and than a tile. */
const LINE_CHECK_STEP = 4;

type Tile = { x: number; y: number };

export class PathfindingManager {
    private grid: number[][];
    private barriers: TileBarriers = TileBarriers.NONE;
    private tileDimensions: { width: number; height: number };

    constructor(collisionsGrid: number[][], tileDimensions: { width: number; height: number }) {
        this.grid = collisionsGrid;
        this.tileDimensions = tileDimensions;
    }

    public setCollisionGrid(collisionGrid: number[][]): void {
        this.grid = collisionGrid;
    }

    /** The thin walls the avatar cannot cross, on top of the tiles of the collision grid. */
    public setBarriers(barriers: TileBarriers): void {
        this.barriers = barriers;
    }

    public findPathFromGameCoordinates(
        start: { x: number; y: number },
        end: { x: number; y: number },
        tryFindingNearestAvailable = false,
    ): Promise<{ x: number; y: number }[]> {
        // The avatar is positioned by its center, the walls and the tiles are crossed by its feet: they say on which side of
        // a wall it stands.
        const startFeet = { x: start.x, y: start.y + this.tileDimensions.height * 0.5 };
        const startTile = this.mapPixelsToTileUnits(this.clampToMap(startFeet));
        const endTile = this.mapPixelsToTileUnits(this.clampToMap(end));
        const result = this.findPath(startTile, endTile, tryFindingNearestAvailable);
        const path = result.path;
        if (path.length > 1) {
            // Replace the first element of the path with the actual start position
            path[0] = startFeet; // We need to add half of the tile height to get the bottom center of the tile as long as the player origin is centered
            // A tile with a wall on one of its sides is reached at its center: the body fits between the wall and the
            // other side, wherever it stands.
            if (result.isExactTarget && !this.barriers.touchesTile(endTile.x, endTile.y)) {
                // Let's put back the exact position.
                // Actually, we are not targeting always the absolutely exact pixel-perfect position.
                // Indeed, we want the hitbox of the sprite to be completely inside the tile.
                // Otherwise, the hitbox of the sprite could overflow a collide tile, so the player could use
                // his keyboard to move the sprite inside the wall.
                path[path.length - 1] = this.fitBodyWithinTile(
                    end.x,
                    end.y,
                    this.tileDimensions.width,
                    this.tileDimensions.height,
                );
            }
        }
        return Promise.resolve(this.straightenPath(path));
    }

    /**
     * The path follows the centers of tiles, which makes stairs where a straight line would do. Each step is dropped
     * when the avatar can walk straight to the next one, as wide as it is and clear of the walls on its sides.
     */
    private straightenPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
        if (path.length < 3) {
            return path;
        }
        const straight = [path[0]];
        let from = 0;
        while (from < path.length - 1) {
            let to = path.length - 1;
            while (to > from + 1 && !this.canWalkStraight(path[from], path[to])) {
                to -= 1;
            }
            straight.push(path[to]);
            from = to;
        }
        return straight;
    }

    /**
     * Whether the avatar can walk from a point to another in a straight line. Its body, and the walls drawn on the
     * borders of the tiles, stay on both sides of the line: three lines are checked, the one of the avatar and one on
     * each side of it.
     */
    private canWalkStraight(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const clearance = CHARACTER_BODY_HEIGHT / 2 + this.barriers.halfThickness;
        const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
        const sides = [-clearance, clearance];
        const pointAt = (distance: number, side: number) => ({
            x: from.x + along.x * distance - along.y * side,
            y: from.y + along.y * distance + along.x * side,
        });
        let previousCenter = this.mapPixelsToTileUnits(from);
        let previousSides = sides.map((side) => this.mapPixelsToTileUnits(pointAt(0, side)));
        const steps = Math.ceil(length / LINE_CHECK_STEP);
        for (let step = 1; step <= steps; step += 1) {
            const distance = Math.min(step * LINE_CHECK_STEP, length);
            const center = this.mapPixelsToTileUnits(pointAt(distance, 0));
            if (!this.isSameTile(center, previousCenter) && !this.canMove(previousCenter, center)) {
                return false;
            }
            const sideTiles = sides.map((side) => this.mapPixelsToTileUnits(pointAt(distance, side)));
            for (const [index, sideTile] of sideTiles.entries()) {
                // The body and the wall drawn on a border reach this far on each side: they must not be in a tile that
                // the avatar could not walk to from the one it is in, i.e. on the other side of a wall.
                const crossed =
                    !this.isSameTile(sideTile, previousSides[index]) && !this.canMove(previousSides[index], sideTile);
                const apart = !this.isSameTile(sideTile, center) && !this.canMove(center, sideTile);
                if (crossed || apart) {
                    return false;
                }
            }
            previousCenter = center;
            previousSides = sideTiles;
        }
        return true;
    }

    private isSameTile(a: Tile, b: Tile): boolean {
        return a.x === b.x && a.y === b.y;
    }

    private fitBodyWithinTile(x: number, y: number, tileWidth: number, tileHeight: number): { x: number; y: number } {
        const xMod = x % tileWidth;
        const yMod = y % tileHeight;

        if (yMod < CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y) {
            y -= yMod;
            y += CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y;
        }
        if (xMod < CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_X) {
            x -= xMod;
            x += CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_X;
        }
        if (yMod > tileHeight - CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y) {
            y -= yMod;
            y += tileHeight - CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_Y;
        }
        if (xMod > tileWidth - CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_X) {
            x -= xMod;
            x += tileWidth - CHARACTER_BODY_HEIGHT / 2 + CHARACTER_BODY_OFFSET_X;
        }

        return { x, y };
    }

    private findPath(
        start: Tile,
        end: Tile,
        tryFindingNearestAvailable: boolean,
    ): { path: { x: number; y: number }[]; isExactTarget: boolean } {
        // A point that can be stood on is only ever reached exactly: a room closed by walls is refused, not replaced by
        // a point on the other side of its walls. Only a point that cannot be stood on (an object, a wall of tiles) is
        // replaced by the free tile next to it that is the nearest to the avatar.
        let endTiles = [end];
        if (tryFindingNearestAvailable && !this.isWalkable(end)) {
            endTiles = this.getNeighbouringTiles(end)
                .filter((tile) => this.isWalkable(tile) && !this.barriers.blocksMove(end, tile))
                .sort(
                    (a, b) => MathUtils.distanceBetween(a, start, false) - MathUtils.distanceBetween(b, start, false),
                );
        }
        for (const endTile of endTiles) {
            const path = this.searchPath(start, endTile);
            if (path.length > 0) {
                return {
                    path: path.map((tile) => this.mapTileUnitToPixels(tile)),
                    isExactTarget: endTile === end,
                };
            }
        }
        return { path: [], isExactTarget: false };
    }

    private isWalkable(tile: Tile): boolean {
        const type = this.grid[tile.y]?.[tile.x];
        return type !== undefined && WALKABLE_TILE_TYPES.has(type);
    }

    /**
     * A* on the tiles, in the 8 directions. A diagonal move needs the two tiles it passes between to be free, and no
     * barrier on the way. The start tile counts even if it is not walkable: the avatar can be standing in it.
     * @returns The tiles from the start to the end, or no tile when there is no way.
     */
    private searchPath(start: Tile, end: Tile): Tile[] {
        const width = this.grid[0]?.length ?? 0;
        const height = this.grid.length;
        if (!this.isWalkable(end) || (start.x === end.x && start.y === end.y)) {
            return [];
        }
        const index = (tile: Tile): number => tile.y * width + tile.x;
        const costFromStart = new Float64Array(width * height).fill(Infinity);
        const previous = new Int32Array(width * height).fill(-1);
        const estimate = (tile: Tile): number => {
            const dx = Math.abs(tile.x - end.x);
            const dy = Math.abs(tile.y - end.y);
            return Math.max(dx, dy) + (DIAGONAL_COST - 1) * Math.min(dx, dy);
        };
        const open = new MinHeap<Tile>();
        costFromStart[index(start)] = 0;
        open.push(start, estimate(start));
        for (let tile = open.pop(); tile !== undefined; tile = open.pop()) {
            if (tile.x === end.x && tile.y === end.y) {
                const path: Tile[] = [];
                for (let current = index(tile); current !== -1; current = previous[current]) {
                    path.unshift({ x: current % width, y: Math.floor(current / width) });
                }
                return path;
            }
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    const next = { x: tile.x + dx, y: tile.y + dy };
                    if ((dx === 0 && dy === 0) || !this.canMove(tile, next)) {
                        continue;
                    }
                    const cost =
                        costFromStart[index(tile)] +
                        (dx !== 0 && dy !== 0 ? DIAGONAL_COST : 1) * (TILE_COST[this.grid[next.y][next.x]] ?? 1);
                    if (cost < costFromStart[index(next)]) {
                        costFromStart[index(next)] = cost;
                        previous[index(next)] = index(tile);
                        open.push(next, cost + estimate(next));
                    }
                }
            }
        }
        return [];
    }

    private canMove(from: Tile, to: Tile): boolean {
        if (!this.isWalkable(to) || this.barriers.blocksMove(from, to)) {
            return false;
        }
        if (from.x === to.x || from.y === to.y) {
            return true;
        }
        // No cutting a corner: the two tiles on both sides of the diagonal must be free too.
        return this.isWalkable({ x: to.x, y: from.y }) && this.isWalkable({ x: from.x, y: to.y });
    }

    public mapTileUnitToPixels(tilePosition: { x: number; y: number }): { x: number; y: number } {
        return {
            x: tilePosition.x * this.tileDimensions.width + this.tileDimensions.width * 0.5,
            y: tilePosition.y * this.tileDimensions.height + this.tileDimensions.height * 0.5,
        };
    }

    private mapPixelsToTileUnits(position: { x: number; y: number }): { x: number; y: number } {
        return {
            x: Math.floor(position.x / this.tileDimensions.width),
            y: Math.floor(position.y / this.tileDimensions.height),
        };
    }

    private getNeighbouringTiles(tile: { x: number; y: number }): { x: number; y: number }[] {
        const xOffsets = [-1, 0, 1, 1, 1, 0, -1, -1];
        const yOffsets = [-1, -1, -1, 0, 1, 1, 1, 0];

        const neighbours: { x: number; y: number }[] = [];
        for (let i = 0; i < 8; i += 1) {
            const tileToCheck = { x: tile.x + xOffsets[i], y: tile.y + yOffsets[i] };
            if (this.isTileWithinMap(tileToCheck)) {
                neighbours.push(tileToCheck);
            }
        }
        return neighbours;
    }

    private isTileWithinMap(tile: { x: number; y: number }): boolean {
        const mapHeight = this.grid.length ?? 0;
        const mapWidth = this.grid[0]?.length ?? 0;

        return MathUtils.isBetween(tile.x, 0, mapWidth) && MathUtils.isBetween(tile.y, 0, mapHeight);
    }

    /**
     * Takes a position in pixels and returns it.
     * It the position is out of the bounds of the map, takes the closest position within the map.
     */
    private clampToMap(position: { x: number; y: number }): { x: number; y: number } {
        let x = position.x;
        let y = position.y;
        const mapHeight = this.grid.length;
        const mapWidth = this.grid[0].length;

        if (x < 0) {
            x = 0;
        }
        if (y < 0) {
            y = 0;
        }
        if (x > mapWidth * this.tileDimensions.width) {
            x = mapWidth * this.tileDimensions.width - 1;
        }
        if (y > mapHeight * this.tileDimensions.height) {
            y = mapHeight * this.tileDimensions.height - 1;
        }

        return { x, y };
    }
}
