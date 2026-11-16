import type { Rect } from "../../Outdoor/OutdoorGrid";
import {
    MAP_LAYER_TILE_SIZE,
    WALL_THICKNESS,
    facadeLeftExtension,
    WALL_FOOTPRINT,
    groundPieceOf,
    mapLayerGroundBottom,
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
/** How far along a wall, on each side of the player, its pieces fade when the player walks behind it. */
export const WALL_HIDING_REACH_PX = 2.5 * MAP_LAYER_TILE_SIZE;
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
 * Rooms a piece stands in front of, hiding their last rows: the ones just north of its foot. The wall at the back of a
 * room and its side walls (the vertical walls and their ends) hide nothing of it: they stay opaque, so that what stands
 * behind them does not show through.
 */
export function roomsBehind(piece: MapLayerPiece, rect: Rect, grid: WallFadeGrid): ReadonlySet<number> {
    if (piece.kind === "floor" || piece.kind === "vertical" || piece.kind === "end") return EMPTY;
    return grid.roomsTouching({ x: rect.x, y: rect.y - 1, width: rect.width, height: 1 });
}

/**
 * Where a piece stands on the ground, in the same way as the outdoor grid reads it: the piece of height 1 it stands in
 * for; a lintel stands where the facade of height 1 under it would.
 */
function groundRect(piece: MapLayerPiece, x: number, y: number): Rect {
    const rise = piece.kind === "floor" ? 0 : wallRise(piece.height);
    return { x, y: y + rise, ...mapLayerPieceSize(groundPieceOf(piece)) };
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
 * Whether the piece of a wall, its sprite at (x, y), hides the player standing behind it: north of its foot, under the
 * top of its sprite, and near enough along the wall (a vertical wall only hides what is right behind its cap). It holds
 * outdoors as well as in a room.
 */
export function wallHidesPlayer(piece: MapLayerPiece, x: number, y: number, player: { x: number; y: number }): boolean {
    if (piece.kind === "floor") return false;
    if (player.y <= y || player.y >= mapLayerGroundBottom(piece, y) - WALL_FOOTPRINT) return false;
    const { width } = mapLayerPieceSize(piece);
    const reach = piece.kind === "vertical" || piece.kind === "end" ? MAP_LAYER_TILE_SIZE / 2 : WALL_HIDING_REACH_PX;
    return Math.abs(player.x - (x + width / 2)) <= reach;
}

interface FadeEntry {
    wall: FadableWall;
    /** Where the piece was read: a piece moved by the editor is read again. */
    x: number;
    y: number;
    piece: MapLayerPiece;
    rect: Rect;
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
 * high ones in front of the room of their avatar, and the high ones their avatar walks behind. Nothing is stored nor sent: only the opacity of the sprites changes.
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
            for (const entry of this.entries.values()) {
                if (entry.piece.kind !== "floor" && !editorOpen && playerRoom !== undefined && grid) {
                    entry.rooms ??= roomsBehind(entry.piece, entry.rect, grid);
                }
                // A high wall the player walks behind fades wherever they are; otherwise the rule of the room applies.
                const hiding =
                    !editorOpen && entry.carrierHeight >= 2 && wallHidesPlayer(entry.piece, entry.x, entry.y, player);
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
                rect: groundRect(piece, wall.x, wall.y),
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
            for (const entry of next.values()) entry.carrierHeight = carrierHeightOf(entry.piece, entry.wall, model);
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
