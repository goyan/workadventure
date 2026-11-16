import type { Rect } from "../../Outdoor/OutdoorGrid";
import {
    MAP_LAYER_TILE_SIZE,
    WALL_HALF,
    WALL_THICKNESS,
    facadeLeftExtension,
    WALL_FOOTPRINT,
    mapLayerGroundBottom,
    mapLayerGroundRect,
    mapLayerPieceSize,
    parseMapLayerPrefab,
    wallRise,
} from "./MapLayerCatalog";
import type { MapLayerPiece, WallHeight } from "./MapLayerCatalog";
import { modelFromPlacedPrefabs } from "./MapLayerOperations";
import type { MapLayerModel } from "./MapLayerModel";

/** Opacity of every wall, door and window while the map editor is open: the objects behind them can be seen. */
export const WALL_EDIT_ALPHA = 0.45;
/** Opacity of the high walls (2 tiles or more) in front of the room the player stands in: the ones that hide it. */
export const WALL_ROOM_ALPHA = 0.55;
/** Margin around a piece of a horizontal wall, along the wall, for the player to be behind it: half an avatar. */
const PLAYER_HALF_WIDTH = MAP_LAYER_TILE_SIZE / 2;
/** A vertical wall only hides the player right behind its cap: this far from its line. */
const VERTICAL_HIDING_REACH_PX = MAP_LAYER_TILE_SIZE / 2;
/** Height of the body of an avatar above the point read for the player: a cap above it hides nothing of it. */
const AVATAR_BODY_HEIGHT_PX = MAP_LAYER_TILE_SIZE;
/** The floor just north of the foot of a piece is read this far above its foot. */
const NORTH_FLOOR_OFFSET_PX = 2;
/** The player is read again for the walls they walk behind once they moved this far. */
const PLAYER_STEP_PX = 4;
/** Duration of a full change of opacity. */
export const WALL_FADE_MS = 200;

/** A piece of the walls on the map (an `Entity` fits). */
export interface FadableWall {
    x: number;
    y: number;
    alpha: number;
    setAlpha(alpha: number): unknown;
    getPrefab(): { collectionName: string; id: string };
}

/** What the fade reads of the outdoor grid. */
export interface WallFadeGrid {
    roomAt(x: number, y: number): number | undefined;
    roomsTouching(rect: Rect): ReadonlySet<number>;
    isOutdoorAt(x: number, y: number): boolean;
}

const EMPTY: ReadonlySet<number> = new Set();

/** Height of the wall a piece belongs to, as told by its own name. */
function pieceHeight(piece: MapLayerPiece): WallHeight {
    return piece.kind === "floor" ? 1 : piece.height;
}

/**
 * Opacity a wall piece should have. `carrierHeight` is the height of the wall that carries the piece: a door or a window
 * lower than its wall follows its wall (by default, the height the piece tells).
 */
export function wallTargetAlpha(
    piece: MapLayerPiece,
    rooms: ReadonlySet<number>,
    state: { editorOpen: boolean; playerRoom: number | undefined },
    carrierHeight: WallHeight = pieceHeight(piece),
): number {
    if (piece.kind === "floor") return 1;
    if (state.editorOpen) return WALL_EDIT_ALPHA;
    if (state.playerRoom === undefined || carrierHeight < 2) return 1;
    return rooms.has(state.playerRoom) ? WALL_ROOM_ALPHA : 1;
}

/**
 * Whether a piece belongs to a horizontal wall: a facade, a window, a lintel, a horizontal door, or a joint with an arm
 * towards the east or the west (it closes the cap of that wall). The others belong to a vertical wall: its strips, its
 * end, a vertical door, and the joints of its cap alone.
 */
export function isHorizontalWallPiece(piece: MapLayerPiece): boolean {
    switch (piece.kind) {
        case "facade":
        case "window":
        case "lintel":
            return true;
        case "door":
            return piece.orientation === "h";
        case "joint":
            return piece.arms.includes("E") || piece.arms.includes("W");
        default:
            return false;
    }
}

/**
 * Rooms a piece stands in front of, hiding their last rows: the ones just north of its foot. The wall at the back of a
 * room and its side walls (the pieces of the vertical walls) hide nothing of it: they stay opaque, so that what stands
 * behind them does not show through.
 */
export function roomsBehind(piece: MapLayerPiece, rect: Rect, grid: WallFadeGrid): ReadonlySet<number> {
    if (!isHorizontalWallPiece(piece)) return EMPTY;
    return grid.roomsTouching({ x: rect.x, y: rect.y - 1, width: rect.width, height: 1 });
}

/**
 * Foot of a piece, on the ground, for the player standing behind it: a joint of a horizontal wall has the foot of the
 * facades it joins, the other pieces the bottom of their piece of height 1.
 */
function hidingFoot(piece: MapLayerPiece, y: number): number {
    if (piece.kind === "joint" && isHorizontalWallPiece(piece)) {
        return y + wallRise(piece.height) + MAP_LAYER_TILE_SIZE;
    }
    return mapLayerGroundBottom(piece, y);
}

/** Height of the wall that carries a door or a window, read in the model; for the other pieces, their own height. */
function carrierHeightOf(piece: MapLayerPiece, wall: FadableWall, model: MapLayerModel): WallHeight {
    const size = MAP_LAYER_TILE_SIZE;
    if (piece.kind === "door") {
        // Each piece of a door covers one segment of the wall (see `computePlacements`).
        const segment =
            piece.orientation === "h"
                ? model.getWall("h", wall.x / size, (wall.y + wallRise(piece.height)) / size)
                : model.getWall("v", (wall.x + size) / size, (wall.y - WALL_THICKNESS) / size);
        return segment?.height ?? piece.height;
    }
    if (piece.kind === "window") {
        const segment = model.getWall(
            "h",
            (wall.x + facadeLeftExtension(piece.ends)) / size,
            (wall.y + wallRise(piece.height)) / size,
        );
        return segment?.height ?? piece.height;
    }
    return pieceHeight(piece);
}

/**
 * Whether the piece of a wall, its sprite at (x, y), stands in front of the player, by its shape only: the player is
 * north of its foot and under the top of its sprite; along the wall, within the piece (half an avatar of margin) for a
 * horizontal wall. A vertical wall only shows its cap: it hides the player right behind it, the cap over their body
 * (not one drawn above their head). Whether a wall stands between them is not told here.
 */
export function wallHidesPlayer(piece: MapLayerPiece, x: number, y: number, player: { x: number; y: number }): boolean {
    if (piece.kind === "floor") return false;
    if (player.y <= y || player.y >= hidingFoot(piece, y) - WALL_FOOTPRINT) return false;
    const { width, height } = mapLayerPieceSize(piece);
    if (!isHorizontalWallPiece(piece)) {
        return (
            player.y < y + height + AVATAR_BODY_HEIGHT_PX &&
            Math.abs(player.x - (x + width / 2)) <= VERTICAL_HIDING_REACH_PX
        );
    }
    return player.x >= x - PLAYER_HALF_WIDTH && player.x <= x + width + PLAYER_HALF_WIDTH;
}

/**
 * The segments of the horizontal wall a piece belongs to, on its grid line: a facade, a window, a lintel or a door
 * piece stands on one; a joint on the ones of its east and west arms.
 */
function horizontalSegmentsOf(
    piece: MapLayerPiece,
    x: number,
    y: number,
): { line: number; columns: number[] } | undefined {
    if (!isHorizontalWallPiece(piece) || piece.kind === "floor") return undefined;
    const size = MAP_LAYER_TILE_SIZE;
    const line = (y + wallRise(piece.height)) / size;
    switch (piece.kind) {
        case "facade":
        case "window":
        case "lintel":
            return { line, columns: [(x + facadeLeftExtension(piece.ends)) / size] };
        case "door":
            return { line, columns: [x / size] };
        case "joint": {
            const vertex = (x + WALL_HALF) / size;
            const columns: number[] = [];
            if (piece.arms.includes("W")) columns.push(vertex - 1);
            if (piece.arms.includes("E")) columns.push(vertex);
            return { line, columns };
        }
        default:
            return undefined;
    }
}

/** Numbers the straight horizontal walls of a model: the runs of consecutive segments on one grid line. */
function straightWalls(model: MapLayerModel): Map<string, number> {
    const byLine = new Map<number, number[]>();
    for (const wall of model.getWalls()) {
        if (wall.orientation !== "h") continue;
        const columns = byLine.get(wall.y) ?? [];
        columns.push(wall.x);
        byLine.set(wall.y, columns);
    }
    const runs = new Map<string, number>();
    let run = -1;
    for (const [line, columns] of byLine) {
        columns.sort((a, b) => a - b);
        columns.forEach((column, index) => {
            if (index === 0 || column !== columns[index - 1] + 1) run++;
            runs.set(`${line}:${column}`, run);
        });
    }
    return runs;
}

interface FadeEntry {
    wall: FadableWall;
    /** Where the piece was read: a piece moved by the editor is read again. */
    x: number;
    y: number;
    piece: MapLayerPiece;
    rect: Rect;
    /** The straight horizontal walls the piece belongs to (`straightWalls`); empty for a piece of a vertical wall. */
    straightWalls: number[];
    /** Rooms the piece stands in front of (`roomsBehind`), read from the current grid; undefined until needed. */
    rooms: ReadonlySet<number> | undefined;
    carrierHeight: WallHeight;
    target: number;
    /** The fade under way: from this opacity, for this long already. */
    from: number;
    elapsed: number;
    /** A piece that appeared on the map takes its opacity at once, with no fade. */
    snap: boolean;
}

/**
 * Makes the walls see-through for the local player only: all of them while the map editor is open; otherwise the
 * high ones in front of the room of their avatar, and the high wall their avatar walks behind: the whole straight
 * wall, on the side of the space where the avatar is (never through a side wall), or the cap of a vertical wall right
 * in front of them. Nothing is stored nor sent: only the opacity of the sprites changes.
 */
export class WallFade {
    private entries = new Map<FadableWall, FadeEntry>();
    private readonly pieceCache = new Map<string, MapLayerPiece | null>();
    private started = false;
    private lastGrid: WallFadeGrid | undefined;
    private lastEditorOpen: boolean | undefined;
    private lastPlayerRoom: number | undefined;
    /** Where the player was when the walls they walk behind were last read. */
    private lastPlayer: { x: number; y: number } | undefined;
    /** The room of the player, kept while they stand on the row of a wall (a wall cell of the grid, not outdoors). */
    private playerRoom: number | undefined;

    constructor(
        private readonly readWalls: () => Iterable<FadableWall>,
        private readonly grid: () => WallFadeGrid | undefined,
        private readonly player: () => { x: number; y: number },
        private readonly editorOpen: () => boolean,
        /** Called after a change of opacity: the scene only draws itself again when told (`DirtyScene`). */
        private readonly markDirty: () => void,
    ) {}

    /** Moves each wall's alpha towards its target, WALL_FADE_MS for a full swing. */
    update(deltaMs: number): void {
        const grid = this.grid();
        const editorOpen = this.editorOpen();
        // The rooms are numbered again with each new grid: the room kept from the previous one means nothing.
        if (grid !== this.lastGrid) this.playerRoom = undefined;
        const playerRoom = this.readPlayerRoom(grid);
        const added = this.readEntries();
        const player = this.player();
        const moved =
            !this.lastPlayer ||
            Math.abs(player.x - this.lastPlayer.x) >= PLAYER_STEP_PX ||
            Math.abs(player.y - this.lastPlayer.y) >= PLAYER_STEP_PX;
        if (moved) this.lastPlayer = { x: player.x, y: player.y };
        const changed =
            added ||
            moved ||
            grid !== this.lastGrid ||
            editorOpen !== this.lastEditorOpen ||
            playerRoom !== this.lastPlayerRoom;
        if (grid !== this.lastGrid) {
            for (const entry of this.entries.values()) entry.rooms = undefined;
        }
        this.lastGrid = grid;
        this.lastEditorOpen = editorOpen;
        this.lastPlayerRoom = playerRoom;
        let redraw = false;
        if (changed) {
            // The player is outdoors when they stand in no room and the grid says so; on the row of a wall, neither.
            const outdoors = grid !== undefined && playerRoom === undefined && grid.isOutdoorAt(player.x, player.y);
            const sameSpace = (entry: FadeEntry): boolean => {
                if (!grid) return true;
                if (playerRoom !== undefined) {
                    entry.rooms ??= roomsBehind(entry.piece, entry.rect, grid);
                    return entry.rooms.has(playerRoom);
                }
                const northX = entry.rect.x + entry.rect.width / 2;
                return outdoors && grid.isOutdoorAt(northX, entry.rect.y - NORTH_FLOOR_OFFSET_PX);
            };
            // The straight walls the player walks behind, from the space they stand in.
            const hidingWalls = new Set<number>();
            if (!editorOpen) {
                for (const entry of this.entries.values()) {
                    if (entry.straightWalls.length === 0 || entry.carrierHeight < 2) continue;
                    if (!wallHidesPlayer(entry.piece, entry.x, entry.y, player) || !sameSpace(entry)) continue;
                    for (const wall of entry.straightWalls) hidingWalls.add(wall);
                }
            }
            for (const entry of this.entries.values()) {
                if (entry.piece.kind !== "floor" && !editorOpen && playerRoom !== undefined && grid) {
                    entry.rooms ??= roomsBehind(entry.piece, entry.rect, grid);
                }
                // A high wall the player walks behind fades wherever they are; otherwise the rule of the room applies.
                const hiding =
                    !editorOpen &&
                    entry.carrierHeight >= 2 &&
                    (entry.straightWalls.length > 0
                        ? entry.straightWalls.some((wall) => hidingWalls.has(wall)) && sameSpace(entry)
                        : wallHidesPlayer(entry.piece, entry.x, entry.y, player));
                const target = hiding
                    ? WALL_ROOM_ALPHA
                    : wallTargetAlpha(
                          entry.piece,
                          entry.rooms ?? EMPTY,
                          { editorOpen, playerRoom },
                          entry.carrierHeight,
                      );
                if (entry.snap) {
                    entry.snap = false;
                    entry.target = target;
                    entry.elapsed = WALL_FADE_MS;
                    if (Math.abs(entry.wall.alpha - target) >= 1e-6) {
                        entry.wall.setAlpha(target);
                        redraw = true;
                    }
                } else if (target !== entry.target) {
                    entry.target = target;
                    entry.from = entry.wall.alpha;
                    entry.elapsed = 0;
                }
            }
        }
        for (const entry of this.entries.values()) {
            if (this.step(entry, deltaMs)) redraw = true;
        }
        if (redraw) this.markDirty();
    }

    /** Every wall back to 1. */
    destroy(): void {
        let redraw = false;
        for (const entry of this.entries.values()) {
            if (entry.wall.alpha !== 1) {
                entry.wall.setAlpha(1);
                redraw = true;
            }
        }
        this.entries.clear();
        if (redraw) this.markDirty();
    }

    /** Moves the opacity of a piece one step towards its target. Returns whether it changed. */
    private step(entry: FadeEntry, deltaMs: number): boolean {
        const alpha = entry.wall.alpha;
        if (Math.abs(alpha - entry.target) < 1e-6) return false;
        if (entry.elapsed >= WALL_FADE_MS) {
            // Someone else changed the opacity (the editor resets it when it dims the other entities): fade back.
            entry.from = alpha;
            entry.elapsed = 0;
        }
        entry.elapsed = Math.min(WALL_FADE_MS, entry.elapsed + deltaMs);
        const progress = entry.elapsed / WALL_FADE_MS;
        entry.wall.setAlpha(progress >= 1 ? entry.target : entry.from + (entry.target - entry.from) * progress);
        return true;
    }

    private readPlayerRoom(grid: WallFadeGrid | undefined): number | undefined {
        if (!grid) {
            this.playerRoom = undefined;
            return undefined;
        }
        const { x, y } = this.player();
        const room = grid.roomAt(x, y);
        if (room !== undefined) {
            this.playerRoom = room;
        } else if (grid.isOutdoorAt(x, y)) {
            this.playerRoom = undefined;
        }
        return this.playerRoom;
    }

    /**
     * Reads the walls of the map again. A piece that appears after the first reading takes its opacity at once; the
     * pieces that went away are forgotten. Returns whether the set of pieces changed.
     */
    private readEntries(): boolean {
        // Most frames, nothing changed: check it without building anything.
        let count = 0;
        let same = true;
        for (const wall of this.readWalls()) {
            const known = this.entries.get(wall);
            if (!known) {
                const prefab = wall.getPrefab();
                // Not a piece of the map layer: it is never kept, so it does not count.
                if (!this.parse(prefab.collectionName, prefab.id)) continue;
            }
            count++;
            if (!known || known.x !== wall.x || known.y !== wall.y) {
                same = false;
                break;
            }
        }
        if (same && count === this.entries.size && this.started) return false;

        const next = new Map<FadableWall, FadeEntry>();
        const fresh: FadeEntry[] = [];
        for (const wall of this.readWalls()) {
            const known = this.entries.get(wall);
            if (known && known.x === wall.x && known.y === wall.y) {
                next.set(wall, known);
                continue;
            }
            const prefab = wall.getPrefab();
            const piece = this.parse(prefab.collectionName, prefab.id);
            if (!piece) continue;
            const entry: FadeEntry = {
                wall,
                piece,
                x: wall.x,
                y: wall.y,
                rect: mapLayerGroundRect(piece, wall.x, wall.y),
                straightWalls: [],
                rooms: undefined,
                carrierHeight: pieceHeight(piece),
                target: Number.NaN,
                from: wall.alpha,
                elapsed: 0,
                // The pieces of the first reading fade in; the ones that appear later take their opacity at once.
                snap: this.started,
            };
            next.set(wall, entry);
            fresh.push(entry);
        }
        const changed = fresh.length > 0 || next.size !== this.entries.size;
        this.entries = next;
        if (changed) {
            // The height of the wall that carries a door or a window is read in the model of all the pieces.
            const model = modelFromPlacedPrefabs(
                Array.from(next.values(), ({ wall }) => {
                    const prefab = wall.getPrefab();
                    return { x: wall.x, y: wall.y, collectionName: prefab.collectionName, prefabId: prefab.id };
                }),
            );
            const runs = straightWalls(model);
            for (const entry of next.values()) {
                entry.carrierHeight = carrierHeightOf(entry.piece, entry.wall, model);
                const segments = horizontalSegmentsOf(entry.piece, entry.x, entry.y);
                const ids = new Set<number>();
                for (const column of segments?.columns ?? []) {
                    const run = runs.get(`${segments?.line}:${column}`);
                    if (run !== undefined) ids.add(run);
                }
                entry.straightWalls = [...ids];
            }
        }
        this.started = true;
        return changed;
    }

    private parse(collectionName: string, prefabId: string): MapLayerPiece | undefined {
        const cached = this.pieceCache.get(prefabId);
        if (cached !== undefined) return cached ?? undefined;
        const piece = parseMapLayerPrefab(collectionName, prefabId);
        this.pieceCache.set(prefabId, piece ?? null);
        return piece;
    }
}
