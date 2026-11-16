import type { Rect } from "../../Outdoor/OutdoorGrid";
import {
    MAP_LAYER_TILE_SIZE,
    WALL_THICKNESS,
    facadeLeftExtension,
    mapLayerPieceSize,
    parseMapLayerPrefab,
    wallRise,
} from "./MapLayerCatalog";
import type { MapLayerPiece, WallHeight } from "./MapLayerCatalog";
import { modelFromPlacedPrefabs } from "./MapLayerOperations";
import type { MapLayerModel } from "./MapLayerModel";

/** Opacity of every wall, door and window while the map editor is open: the objects behind them can be seen. */
export const WALL_EDIT_ALPHA = 0.45;
/** Opacity of the high walls (2 tiles or more) of the room the player stands in. */
export const WALL_ROOM_ALPHA = 0.55;
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
 * Where a piece stands on the ground, in the same way as the outdoor grid reads it: the piece of height 1 it stands in
 * for; a lintel stands where the facade of height 1 under it would.
 */
function groundRect(piece: MapLayerPiece, x: number, y: number): Rect {
    if (piece.kind === "floor") {
        return { x, y, ...mapLayerPieceSize(piece) };
    }
    const ground: MapLayerPiece =
        piece.kind === "lintel"
            ? { kind: "facade", tint: piece.tint, ends: piece.ends, height: 1 }
            : { ...piece, height: 1 };
    return { x, y: y + wallRise(piece.height), ...mapLayerPieceSize(ground) };
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

interface FadeEntry {
    wall: FadableWall;
    /** Where the piece was read: a piece moved by the editor is read again. */
    x: number;
    y: number;
    piece: MapLayerPiece;
    rect: Rect;
    /** Rooms the piece borders, read from the current grid; undefined until needed. */
    rooms: ReadonlySet<number> | undefined;
    carrierHeight: WallHeight;
    target: number;
    /** The fade under way: from this opacity, for this long already. */
    from: number;
    elapsed: number;
    /** A piece that appeared on the map takes its opacity at once, with no fade. */
    snap: boolean;
}

const EMPTY: ReadonlySet<number> = new Set();

/**
 * Makes the walls see-through for the local player only: all of them while the map editor is open, the high ones
 * that border the room of their avatar otherwise. Nothing is stored nor sent: only the opacity of the sprites changes.
 */
export class WallFade {
    private entries = new Map<FadableWall, FadeEntry>();
    private readonly pieceCache = new Map<string, MapLayerPiece | null>();
    private started = false;
    private lastGrid: WallFadeGrid | undefined;
    private lastEditorOpen: boolean | undefined;
    private lastPlayerRoom: number | undefined;
    /** The room of the player, kept while they stand on the row of a wall (a wall cell of the grid, not outdoors). */
    private playerRoom: number | undefined;

    constructor(
        private readonly readWalls: () => Iterable<FadableWall>,
        private readonly grid: () => WallFadeGrid | undefined,
        private readonly player: () => { x: number; y: number },
        private readonly editorOpen: () => boolean,
    ) {}

    /** Moves each wall's alpha towards its target, WALL_FADE_MS for a full swing. */
    update(deltaMs: number): void {
        const grid = this.grid();
        const editorOpen = this.editorOpen();
        const playerRoom = this.readPlayerRoom(grid);
        const added = this.readEntries();
        const changed =
            added || grid !== this.lastGrid || editorOpen !== this.lastEditorOpen || playerRoom !== this.lastPlayerRoom;
        if (grid !== this.lastGrid) {
            for (const entry of this.entries.values()) entry.rooms = undefined;
        }
        this.lastGrid = grid;
        this.lastEditorOpen = editorOpen;
        this.lastPlayerRoom = playerRoom;
        if (changed) {
            for (const entry of this.entries.values()) {
                if (entry.piece.kind !== "floor" && !editorOpen && playerRoom !== undefined && grid) {
                    entry.rooms ??= grid.roomsTouching(entry.rect);
                }
                const target = wallTargetAlpha(
                    entry.piece,
                    entry.rooms ?? EMPTY,
                    { editorOpen, playerRoom },
                    entry.carrierHeight,
                );
                if (entry.snap) {
                    entry.snap = false;
                    entry.target = target;
                    entry.elapsed = WALL_FADE_MS;
                    entry.wall.setAlpha(target);
                } else if (target !== entry.target) {
                    entry.target = target;
                    entry.from = entry.wall.alpha;
                    entry.elapsed = 0;
                }
            }
        }
        for (const entry of this.entries.values()) this.step(entry, deltaMs);
    }

    /** Every wall back to 1. */
    destroy(): void {
        for (const entry of this.entries.values()) entry.wall.setAlpha(1);
        this.entries.clear();
    }

    private step(entry: FadeEntry, deltaMs: number): void {
        const alpha = entry.wall.alpha;
        if (Math.abs(alpha - entry.target) < 1e-6) return;
        if (entry.elapsed >= WALL_FADE_MS) {
            // Someone else changed the opacity (the editor resets it when it dims the other entities): fade back.
            entry.from = alpha;
            entry.elapsed = 0;
        }
        entry.elapsed = Math.min(WALL_FADE_MS, entry.elapsed + deltaMs);
        const progress = entry.elapsed / WALL_FADE_MS;
        entry.wall.setAlpha(progress >= 1 ? entry.target : entry.from + (entry.target - entry.from) * progress);
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
