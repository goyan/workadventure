import * as Phaser from "phaser";
import { get } from "svelte/store";
import { LL } from "../../../../i18n/i18n-svelte";
import {
    floorLevelCurrentStore,
    floorLevelViewedStore,
    floorLevelName,
    floorLevelsBuiltStore,
    floorLevelsHiddenStore,
} from "../../../Stores/FloorLevelsStore";
import { floorGroups, floorGroupBounds } from "../MapEditor/MapLayer/FloorGroups";
import type { FloorGroup } from "../MapEditor/MapLayer/FloorGroups";
import { stairEnds } from "../MapEditor/MapLayer/FloorPath";
import { floorRailings, railingClosers } from "../MapEditor/MapLayer/FloorRailings";
import type { RailingWall } from "../MapEditor/MapLayer/FloorRailings";
import { levelItems, parseAnyLevelPrefab } from "../MapEditor/MapLayer/MapLayerLevels";
import type { LevelPlaced } from "../MapEditor/MapLayer/MapLayerLevels";
import { modelFromPlacedPrefabs } from "../MapEditor/MapLayer/MapLayerOperations";
import type { TileBarriers } from "../../../Utils/TileBarriers";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { FloorModel, stairFootFromImage } from "../MapEditor/MapLayer/FloorModel";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import { FLOOR_PREVIEW_DEPTH, floorDepth, floorPieceDepth } from "../MapEditor/MapLayer/FloorDepth";
import { floorStep, restoredFloorState } from "../MapEditor/MapLayer/FloorWalk";
import type { FloorWalkState, StairSide } from "../MapEditor/MapLayer/FloorWalk";
import { parseFloorPiece, stairGroundBox } from "../MapEditor/MapLayer/MapLayerFloors";
import type { FloorPiece, StairShape } from "../MapEditor/MapLayer/MapLayerFloors";
import { FloorRailingsView } from "./FloorRailingsView";
import { floorZToShare } from "./FloorProtocol";
import {
    ABOVE_ALPHA,
    ABOVE_TINT,
    aboveLevelShows,
    editorLevelAlpha,
    STAIR_OVER_AVATAR_ALPHA,
    stairCoversAvatar,
    stairDepth,
    stairShows,
    veilAlphaToward,
    VEIL_ALPHA,
    VEIL_COLOR,
    currentLevels,
    fadeToward,
    levelLook,
    veilDepth,
} from "./LevelFocus";
import { avatarGroundTile, stairLabels } from "./StairHints";
import { StairHintsView } from "./StairHintsView";

/**
 * TRIAL of the raised floors, enabled by `?palier=piece`, `?palier=1` or `?palier=<cellX>,<cellY>`: the floors are
 * built in memory and drawn in code (no catalog, no editor yet), the walking is the real one (`floorStep`).
 */
export interface FloorAvatar {
    x: number;
    y: number;
    setPosition(x: number, y: number): unknown;
    setFloorZ(z: number): void;
}

/** The point read for the avatar, under its centre: between its feet. */
const FEET_OFFSET_Y = 12;
/** Opacity of a floor the avatar is under, or climbs to: a grey veil (LevelFocus). */
const HIDDEN_ALPHA = ABOVE_ALPHA;
/** Opacity of the slabs that hide a stair. */
const OVER_STAIR_ALPHA = 0.55;
const FADE_MS = 200;
const TILE = MAP_LAYER_TILE_SIZE;

interface LevelDrawing {
    /** Names the floor among the floors of the map (see FloorGroup.key). */
    key: string;
    elevation: number;
    /** The tiles its slabs cover on the ground, as `x:y`. */
    cells: Set<string>;
    /** The rooms of the ground it has slabs over, and the ones its slabs are drawn over. */
    roomsUnder: Set<number>;
    roomsCovered: Set<number>;
    alpha: number;
    /**
     * Whether the slabs drawn over a stair let it show through: for whoever is under the floor (and in the map
     * editor), not for somebody standing on it or above it.
     */
    seeThrough: boolean;
    /** Shows the slabs of the level at this opacity; the ones drawn over a stair let it show through (`seeThrough`). */
    show(alpha: number): void;
    /** The slabs of the level placed on the map, where they are drawn. */
    slabEntities: FloorEntity[];
    /** Whether its slabs are greyed: a floor above the avatar. */
    tinted?: boolean;
}

/** A slab or a stair placed on the map (an `Entity` fits). */
export interface FloorEntity {
    x: number;
    y: number;
    setAlpha(alpha: number): unknown;
    getPrefab(): { collectionName: string; id: string };
    getEntityData(): { elevation?: number };
    /** Greys a slab of a floor above the avatar; undone by clearTint. */
    setTint?(color: number): unknown;
    clearTint?(): unknown;
    /** Where it is drawn among the others: a stair is lifted over the veil of the floors under the avatar. */
    depth?: number;
    setDepth?(depth: number): unknown;
    /** The size of its image, for a stair: what it hides on the screen. */
    displayWidth?: number;
    displayHeight?: number;
}

/** Whether a slab, where it is drawn, hides an avatar: about 36 px high above its feet, 24 px wide. */
export function slabCoversAvatar(slab: { x: number; y: number }, feet: { x: number; y: number }): boolean {
    return feet.x + 12 > slab.x && feet.x - 12 < slab.x + TILE && feet.y > slab.y && feet.y - 36 < slab.y + TILE;
}

/** How far around the avatar the slabs of a floor let it show through outdoors: about two tiles. */
const WINDOW_TILES = 2;

/** Whether a slab, where it is drawn, is in the window around an avatar that shows through a floor outdoors. */
export function slabInAvatarWindow(slab: { x: number; y: number }, feet: { x: number; y: number }): boolean {
    const reach = WINDOW_TILES * TILE;
    return (
        slab.x + TILE > feet.x - 12 - reach &&
        slab.x < feet.x + 12 + reach &&
        slab.y + TILE > feet.y - 36 - reach &&
        slab.y < feet.y + reach
    );
}

/** A stair of the map as it shows through: its image, the altitude it goes up to, and how opaque it is now. */
interface StairDrawing {
    entity: FloorEntity;
    /** Altitude of the floor it stands on (0: the ground) and of the one it goes up to. */
    base: number;
    top: number;
    /** How opaque it is by itself: less when it is drawn over the avatar. */
    alpha: number;
    /** How opaque it is drawn: no more than the floor it stands on, which it shows through with. */
    shown: number;
    /** The floor it stands on, when it does not start from the ground. */
    floor: LevelDrawing | undefined;
    /** Its own depth (as `Entity` sorts it), and where its foot row ends on the ground. */
    ownDepth: number;
    groundBottom: number;
}

/** The floors of the map are read again this often: the map editor changes them. */
const MAP_REFRESH_MS = 400;

const stair = (direction: StairShape["direction"], width: 1 | 2 = 1): StairShape => ({
    direction,
    width,
    rise: 52,
    open: false,
});

function slabs(model: FloorModel, elevation: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) model.setSlab(elevation, x, y, "parquet-clair");
}

/**
 * The guinea-pig room of the local team map (walls of height 2, tiles 126..131 x 70..75): a mezzanine over its four
 * north rows, with two wells cut in it. A stair going north along the west wall arrives in a well 1 x 2 at the south
 * edge of the mezzanine, which goes on beside it; a stair going west arrives in a well 2 x 1 in its middle.
 */
function roomModel(): FloorModel {
    const model = new FloorModel();
    slabs(model, 52, 126, 70, 131, 73);
    for (const placed of [
        model.addStair(stair("n"), { x: 126, y: 73 }, 0),
        model.addStair(stair("o"), { x: 130, y: 71 }, 0),
    ]) {
        // The well: no slab over the stair.
        for (const cell of stairCells(placed)) model.removeSlab(52, cell.x, cell.y);
    }
    return model;
}

/** Around a tile: a floor with a stair on each side, and a second floor over a part of it. */
function openModel(x: number, y: number): FloorModel {
    const model = new FloorModel();
    slabs(model, 52, x + 2, y - 6, x + 7, y - 3);
    model.addStair(stair("n"), { x: x + 3, y: y - 1 }, 0);
    model.addStair(stair("s"), { x: x + 6, y: y - 9 }, 0);
    model.addStair(stair("e"), { x, y: y - 4 }, 0);
    model.addStair(stair("o", 2), { x: x + 9, y: y - 5 }, 0);
    // A second floor, reached from the first one.
    slabs(model, 104, x + 2, y - 10, x + 4, y - 8);
    model.addStair(stair("n"), { x: x + 2, y: y - 6 }, 52);
    return model;
}

function stairCells(placed: PlacedStair): { x: number; y: number }[] {
    const g = placed.ground;
    const cells = [];
    for (let x = g.x / TILE; x < (g.x + g.width) / TILE; x++) {
        for (let y = g.y / TILE; y < (g.y + g.height) / TILE; y++) cells.push({ x, y });
    }
    return cells;
}

/** Whether a wall of the ground stands along a side of a stair that starts from the ground. */
export function stairSideClosed(placed: PlacedStair, side: StairSide, barriers: TileBarriers): boolean {
    if (placed.base !== 0) return false;
    const direction = placed.shape.direction;
    const horizontal = direction === "e" || direction === "o";
    let step: { x: number; y: number };
    if (side === "foot") {
        step =
            direction === "n"
                ? { x: 0, y: 1 }
                : direction === "s"
                  ? { x: 0, y: -1 }
                  : direction === "e"
                    ? { x: -1, y: 0 }
                    : { x: 1, y: 0 };
    } else {
        const sign = side === "min" ? -1 : 1;
        step = horizontal ? { x: 0, y: sign } : { x: sign, y: 0 };
    }
    return stairCells(placed).some((cell) => barriers.blocksMove(cell, { x: cell.x + step.x, y: cell.y + step.y }));
}

/** Somebody else on the map, as the floors fade it. */
/** How long the floor of the avatar before a reload is looked for: the catalogs of the map load after the avatar. */
const RESTORE_MS = 15_000;
/** The slabs are read again this often meanwhile. */
const RESTORE_RETRY_MS = 300;
/** Walked further than this, the avatar is not where it was before the reload: nothing to restore. */
const RESTORE_REACH_PX = 8;

export interface FloorOccupant {
    /** Where it is drawn: tells the floor it stands on among the ones of its altitude. */
    x?: number;
    y?: number;
    isOnFloor(elevation: number): boolean;
    setAlpha(alpha: number): unknown;
}

export class FloorSpike {
    private model: FloorModel | undefined;
    private state: FloorWalkState = { elevation: 0 };
    private prev: { x: number; y: number } | undefined;
    /** The floor to put the avatar back on (`restore`), tried until the slabs of the map are read or it moved away. */
    private restoring: { elevation: number; x: number; y: number; left: number } | undefined;
    private readonly levels: LevelDrawing[] = [];
    private readonly railings: FloorRailingsView;
    private stairDrawings: StairDrawing[] = [];
    /** How opaque each slab in the window around the avatar is, by itself (1 when absent). */
    private readonly localFade = new Map<FloorEntity, number>();
    private readonly fadedOccupants = new Set<FloorOccupant>();
    private readonly drawings: Phaser.GameObjects.Graphics[] = [];
    private readonly label: Phaser.GameObjects.Text;
    /** The dark veil over the floors under the avatar (LevelFocus), and how opaque it is now. */
    private readonly veil: Phaser.GameObjects.Rectangle;
    private veilAlpha = 0;
    private readonly reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    /** The label of the floor a stair leads to. */
    private readonly hints: StairHintsView;
    private barriers: TileBarriers | undefined;
    private barriersAge = 0;
    private mapAge = 0;
    /** The altitude last told to the other players, and the time since. */
    private shared = 0;
    private sinceShared = 0;
    private mapSignature = "";

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly avatar: () => FloorAvatar | undefined,
        /** A trial layout built in memory (`piece`, `1`, `<x>,<y>`); undefined: the floors placed on the map. */
        private readonly origin: string | undefined,
        /** The walls of the ground, as barriers between tiles. */
        private readonly readBarriers: () => TileBarriers,
        private readonly readEntities: () => Iterable<FloorEntity>,
        /** The map editor: whether it is open, and the floor being edited. */
        private readonly editor: () => { open: boolean; level: number },
        /** Tells the other players the altitude of the avatar. */
        private readonly share: (z: number) => void,
        /** Tells the floors that have slabs on the map, lowest first, each time they change. */
        private readonly onLevels: (levels: number[]) => void,
        /** The other players: each one lets the avatar show through with the floor it stands on. */
        private readonly others: () => Iterable<FloorOccupant> = () => [],
        /** The room of the map a point of the ground is in, if any (see OutdoorGrid.roomAt). */
        private readonly roomAt: (x: number, y: number) => number | undefined = () => undefined,
    ) {
        this.railings = new FloorRailingsView(scene);
        this.label = scene.add.text(0, 0, "", { fontSize: "10px", color: "#ffffff", backgroundColor: "#000000" });
        this.label.setDepth(FLOOR_PREVIEW_DEPTH);
        this.hints = new StairHintsView(scene);
        this.veil = scene.add.rectangle(0, 0, 1, 1, VEIL_COLOR).setOrigin(0, 0).setAlpha(0).setVisible(false);
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.step);
    }

    /**
     * The raised floor a point of the screen stands on at this altitude: its key and the rectangle it covers on the
     * screen. Undefined over no slab of that altitude.
     */
    public floorZoneAt(
        elevation: number,
        x: number,
        y: number,
    ): { key: string; x: number; y: number; width: number; height: number } | undefined {
        const cell = `${Math.floor(x / TILE)}:${Math.floor((y + elevation) / TILE)}`;
        const level = this.levels.find((candidate) => candidate.elevation === elevation && candidate.cells.has(cell));
        if (!level) return undefined;
        const cells = [...level.cells].map((key) => {
            const [column, row] = key.split(":").map(Number);
            return { x: column, y: row };
        });
        return { key: level.key, ...floorGroupBounds({ level: elevation, cells, key: level.key }) };
    }

    /**
     * After a reload, puts the avatar back on the raised floor it stood on. The slabs come with the catalogs of the
     * map, a moment after the avatar: tried for a few seconds, and given up if the avatar walked away meanwhile.
     */
    public restore(elevation: number): void {
        const avatar = this.avatar();
        if (!avatar || !(elevation > 0)) return;
        this.restoring = { elevation, x: avatar.x, y: avatar.y, left: RESTORE_MS };
    }

    /**
     * The altitude of the floor the avatar stands on; undefined on a stair, between two floors. While a floor is
     * being restored, it is that one.
     */
    public restingElevation(): number | undefined {
        if (this.restoring) return this.restoring.elevation;
        return this.state.stair === undefined ? this.state.elevation : undefined;
    }

    /** The floors of the map and where the avatar is on them, for a computed walk; undefined without floors. */
    public walkContext(): { model: FloorModel; state: FloorWalkState } | undefined {
        return this.model && this.model.getSlabs().length > 0 ? { model: this.model, state: this.state } : undefined;
    }

    public destroy(): void {
        this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.step);
        for (const drawing of this.drawings) drawing.destroy();
        this.railings.destroy();
        this.label.destroy();
        this.veil.destroy();
        this.hints.destroy();
        floorLevelsBuiltStore.set([]);
        floorLevelCurrentStore.set(0);
        floorLevelViewedStore.set(undefined);
    }

    /** For the tests in the browser. */
    public debug(): { state: FloorWalkState; levels: { elevation: number; alpha: number }[] } {
        return { state: this.state, levels: this.levels.map(({ elevation, alpha }) => ({ elevation, alpha })) };
    }

    private readonly closed = (index: number, side: StairSide): boolean => {
        const placed = this.model?.getStairs()[index];
        return placed !== undefined && this.barriers !== undefined && stairSideClosed(placed, side, this.barriers);
    };

    private readonly step = (_time: number, delta: number): void => {
        const avatar = this.avatar();
        if (!avatar) return;
        const p = { x: avatar.x, y: avatar.y + FEET_OFFSET_Y };
        if (this.origin === undefined) {
            this.mapAge -= delta;
            if (!this.model || this.mapAge <= 0) {
                this.mapAge = MAP_REFRESH_MS;
                this.readMap();
            }
        }
        if (!this.model) {
            const origin = this.origin ?? "";
            const cells = origin.split(",").map((value) => Number.parseInt(value, 10));
            const given = cells.length === 2 && cells.every((value) => Number.isFinite(value));
            this.model =
                origin === "piece"
                    ? roomModel()
                    : given
                      ? openModel(cells[0], cells[1])
                      : openModel(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
            this.draw(this.model);
        }
        // The walls change with the map editor: read again from time to time.
        this.barriersAge -= delta;
        if (!this.barriers || this.barriersAge <= 0) {
            this.barriers = this.readBarriers();
            this.barriersAge = 2000;
        }
        if (this.restoring) {
            const { elevation, x, y } = this.restoring;
            this.restoring.left -= delta;
            const moved = Math.hypot(avatar.x - x, avatar.y - y) > RESTORE_REACH_PX;
            const state = moved ? undefined : restoredFloorState(this.model, p, elevation);
            if (state) {
                this.state = state;
                this.prev = p;
            }
            if (state || moved || this.restoring.left <= 0) this.restoring = undefined;
            // The slabs are read again soon: they may not be loaded yet.
            else this.mapAge = Math.min(this.mapAge, RESTORE_RETRY_MS);
        }
        if (this.prev && Math.hypot(p.x - this.prev.x, p.y - this.prev.y) > 0.01) {
            floorLevelViewedStore.set(undefined);
        }
        const result = floorStep(this.model, this.state, this.prev ?? p, p, this.closed);
        if (result.p.x !== p.x || result.p.y !== p.y) {
            avatar.setPosition(result.p.x, result.p.y - FEET_OFFSET_Y);
        }
        this.prev = result.p;
        this.state = result.state;
        avatar.setFloorZ(result.state.elevation);
        this.sinceShared += delta;
        const toShare = floorZToShare(this.state, this.shared, this.sinceShared);
        if (toShare !== undefined) {
            this.shared = toShare;
            this.sinceShared = 0;
            this.share(toShare);
        }
        this.fade(this.model, result.p, delta);
        this.updateHints(this.model, result.p);

        this.label.setVisible(this.origin !== undefined);
        this.label.setPosition(result.p.x + 14, result.p.y - 44);
        this.label.setText(`z=${Math.round(this.state.elevation)}${this.state.stair === undefined ? "" : " escalier"}`);
    };

    /** Near the end of a stair, the name of the floor at its other end. */
    private updateHints(model: FloorModel, p: { x: number; y: number }): void {
        const editorOpen = this.editor().open;
        const stairs = model.getStairs();
        const tile = avatarGroundTile(p, this.state.elevation);
        const labels = editorOpen
            ? []
            : stairLabels(stairs, tile, this.state, (elevation) =>
                  floorLevelName(get(LL), elevation, get(floorLevelsBuiltStore)),
              );
        this.hints.update(stairs, labels);
        // The stack of the floors under the clock: the floor stood on, the last one while on a stair.
        floorLevelsHiddenStore.set(editorOpen);
        if (this.state.stair === undefined) floorLevelCurrentStore.set(this.state.elevation);
    }

    /** The room of the ground the avatar is in: its altitude further south than where it is drawn. */
    private room(p: { x: number; y: number }): number | undefined {
        return this.roomAt(p.x, p.y + this.state.elevation);
    }

    /** Where the foot row of a stair placed at (x, y) ends on the ground, in pixels. */
    private stairGroundBottom(piece: FloorPiece, entity: FloorEntity, elevation: number): number {
        if (piece.kind !== "stair") return entity.y;
        const foot = stairFootFromImage(piece, entity.x, entity.y, elevation);
        if (!foot) return entity.y + (entity.displayHeight ?? 0);
        const ground = stairGroundBox(piece, foot);
        return ground.y + ground.height;
    }

    /** The dark veil over the floors under the avatar: over the whole view, just under the floor the avatar is on. */
    private updateVeil(depth: number | undefined, delta: number): void {
        const target = depth === undefined || this.levels.length === 0 ? 0 : VEIL_ALPHA;
        const next = veilAlphaToward(this.veilAlpha, target, delta, this.reducedMotion);
        if (next === 0 && this.veilAlpha === 0) return;
        const changed = next !== this.veilAlpha || (depth !== undefined && depth !== this.veil.depth);
        this.veilAlpha = next;
        if (depth !== undefined) this.veil.setDepth(depth);
        // It covers the view: follow the camera (whose move redraws the scene anyway).
        const view = this.scene.cameras.main.worldView;
        this.veil
            .setPosition(view.x - TILE, view.y - TILE)
            .setSize(view.width + 2 * TILE, view.height + 2 * TILE)
            .setAlpha(next)
            .setVisible(next > 0);
        if (changed) this.scene.markDirty();
    }

    /**
     * Outdoors, the slabs around the avatar let it show through the floors that hide it, the rest of the building
     * staying whole. Each slab fades in and out by itself.
     */
    private fadeWindow(windowed: ReadonlySet<LevelDrawing>, p: { x: number; y: number }, delta: number): void {
        if (windowed.size === 0 && this.localFade.size === 0) return;
        const change = ((1 - HIDDEN_ALPHA) * delta) / FADE_MS;
        const touched = new Set<LevelDrawing>();
        for (const level of this.levels) {
            const open = windowed.has(level);
            for (const slab of level.slabEntities) {
                const current = this.localFade.get(slab);
                const target = open && slabInAvatarWindow(slab, p) ? HIDDEN_ALPHA : 1;
                if ((current ?? 1) === target) continue;
                const next =
                    target < (current ?? 1)
                        ? Math.max(target, (current ?? 1) - change)
                        : Math.min(target, (current ?? 1) + change);
                if (next === 1) this.localFade.delete(slab);
                else this.localFade.set(slab, next);
                touched.add(level);
            }
        }
        for (const level of touched) level.show(level.alpha);
        if (touched.size > 0) this.scene.markDirty();
    }

    /** The floors above the avatar are hidden indoors and up a floor (LevelFocus), the stairs always show. */
    private fade(model: FloorModel, p: { x: number; y: number }, delta: number): void {
        const editor = this.editor();
        const viewed = get(floorLevelViewedStore);
        // Where the avatar is on the ground: its altitude further south than where it is drawn.
        const room = this.room(p);
        // The floors that hide the avatar outdoors: they let it show through a window around it.
        const windowed = new Set<LevelDrawing>();
        // The floors the avatar is on: its own, or both floors of the stair it climbs.
        const current =
            editor.open && Number.isFinite(editor.level)
                ? new Set([editor.level])
                : viewed === undefined
                  ? currentLevels(this.state, model.getStairs())
                  : new Set([viewed]);
        for (const level of this.levels) {
            let target = 1;
            if (editor.open) {
                target = editorLevelAlpha(level.elevation, editor.level);
            } else if (viewed !== undefined) {
                target = level.elevation > viewed ? 0 : 1;
            } else if (levelLook(level.elevation, current) === "above") {
                const shows = aboveLevelShows({
                    indoors: room !== undefined,
                    underFloor: level.cells.has(
                        `${Math.floor(p.x / TILE)}:${Math.floor((p.y + this.state.elevation) / TILE)}`,
                    ),
                    raised: this.state.elevation > 0 || this.state.stair !== undefined,
                    hidesAvatar: level.slabEntities.some((slab) => slabCoversAvatar(slab, p)),
                });
                target = shows.alpha;
                if (shows.window) windowed.add(level);
            }
            // The slabs over a stair only let it show through from under their floor: standing on that floor, or
            // above it, one sees a plain floor.
            const seeThrough = levelLook(level.elevation, current) === "above";
            if (seeThrough !== level.seeThrough) {
                level.seeThrough = seeThrough;
                level.show(level.alpha);
                this.scene.markDirty();
            }
            // A floor above the avatar is a grey veil, not a faded floor in its colours.
            const tinted = !editor.open && target < 1;
            if (tinted !== (level.tinted ?? false)) {
                level.tinted = tinted;
                for (const slab of level.slabEntities) {
                    if (tinted) slab.setTint?.(ABOVE_TINT);
                    else slab.clearTint?.();
                }
                this.scene.markDirty();
            }
            if (level.alpha === target) continue;
            const change = ((1 - HIDDEN_ALPHA) * delta) / FADE_MS;
            level.alpha =
                target > level.alpha ? Math.min(target, level.alpha + change) : Math.max(target, level.alpha - change);
            level.show(level.alpha);
            this.scene.markDirty();
        }
        this.fadeWindow(windowed, p, delta);
        // The stairs of the floor of the avatar show: they tell how to go up and down (LevelFocus). A stair standing on
        // a floor above the avatar shows with that floor; one coming from under the avatar is lifted over the veil.
        const veil = editor.open && !Number.isFinite(editor.level) ? undefined : veilDepth(current);
        for (const stair of this.stairDrawings) {
            const { entity } = stair;
            // A stair drawn over the avatar lets it show through, without fading away (it tells the way up).
            const covers =
                !editor.open &&
                stairCoversAvatar(
                    {
                        image: {
                            x: entity.x,
                            y: entity.y,
                            width: entity.displayWidth ?? 0,
                            height: entity.displayHeight ?? 0,
                        },
                        groundBottom: stair.groundBottom,
                        top: stair.top,
                    },
                    { x: p.x, y: p.y, elevation: this.state.elevation, onStair: this.state.stair !== undefined },
                );
            const target = covers ? STAIR_OVER_AVATAR_ALPHA : 1;
            if (stair.alpha !== target) {
                stair.alpha = fadeToward(stair.alpha, target, delta, 1 - STAIR_OVER_AVATAR_ALPHA, this.reducedMotion);
            }
            const above = levelLook(stair.base, current) === "above" && !editor.open;
            // Only the stairs connecting the focused floor show, including in construction mode.
            const shown =
                (!editor.open || Number.isFinite(editor.level)) && !stairShows(stair, current)
                    ? 0
                    : above
                      ? Math.min(stair.alpha, stair.floor?.alpha ?? 1)
                      : stair.alpha;
            if (shown !== stair.shown) {
                stair.shown = shown;
                entity.setAlpha(shown);
                this.scene.markDirty();
            }
            const depth = stairDepth(stair.ownDepth, veil, levelLook(stair.base, current));
            if (entity.depth !== depth) {
                entity.setDepth?.(depth);
                this.scene.markDirty();
            }
        }
        this.updateVeil(veil, delta);
        // Somebody standing on a floor fades with it, instead of floating over what shows through.
        for (const other of this.others()) {
            const alpha =
                this.levels.find(
                    (level) =>
                        other.isOnFloor(level.elevation) &&
                        // Among the floors of its altitude, the one under its feet (its altitude further south).
                        (other.x === undefined ||
                            other.y === undefined ||
                            level.cells.has(
                                `${Math.floor(other.x / TILE)}:${Math.floor((other.y + FEET_OFFSET_Y + level.elevation) / TILE)}`,
                            )),
                )?.alpha ?? 1;
            if (alpha < 1) {
                other.setAlpha(alpha);
                this.fadedOccupants.add(other);
            } else if (this.fadedOccupants.delete(other)) {
                other.setAlpha(1);
            }
        }
    }

    /**
     * Reads the slabs and the stairs placed on the map; rebuilds the floors when they changed. The opacity of a level
     * is then set on its entities.
     */
    /**
     * The rooms of the ground each floor has slabs over, and the ones its slabs are drawn over (their altitude
     * further north): read again with the map, the walls change the rooms.
     */
    private readLevelRooms(): void {
        for (const level of this.levels) {
            level.roomsUnder.clear();
            level.roomsCovered.clear();
            for (const cell of level.cells) {
                const [x, y] = cell.split(":").map(Number);
                const centreX = x * TILE + TILE / 2;
                const centreY = y * TILE + TILE / 2;
                const under = this.roomAt(centreX, centreY);
                if (under !== undefined) level.roomsUnder.add(under);
                const covered = this.roomAt(centreX, centreY - level.elevation);
                if (covered !== undefined) level.roomsCovered.add(covered);
            }
        }
    }

    /** The floor of an altitude that covers a tile of the ground, if any. */
    private floorAt(elevation: number, cell: { x: number; y: number }): LevelDrawing | undefined {
        return this.levels.find((level) => level.elevation === elevation && level.cells.has(`${cell.x}:${cell.y}`));
    }

    private readMap(): void {
        const pieces: { entity: FloorEntity; piece: FloorPiece; elevation: number }[] = [];
        const standing: { entity: FloorEntity; elevation: number }[] = [];
        const placedWalls: LevelPlaced[] = [];
        let signature = "";
        for (const entity of this.readEntities()) {
            const prefab = entity.getPrefab();
            const piece = parseFloorPiece(prefab.collectionName, prefab.id);
            const elevation = entity.getEntityData().elevation ?? 0;
            if (!piece && parseAnyLevelPrefab(prefab.collectionName, prefab.id)) {
                // The walls decide where the floors have a railing (see railingClosers): of the ground too.
                placedWalls.push({
                    x: entity.x,
                    y: entity.y,
                    collectionName: prefab.collectionName,
                    prefabId: prefab.id,
                    elevation,
                });
                if (elevation === 0) signature += `#${prefab.id}@${entity.x},${entity.y};`;
            }
            if (!piece) {
                // What stands on a raised floor (furniture, walls) shows through with its floor.
                if (elevation > 0) {
                    standing.push({ entity, elevation });
                    signature += `+${prefab.id}@${entity.x},${entity.y},${elevation};`;
                }
                continue;
            }
            pieces.push({ entity, piece, elevation });
            signature += `${prefab.id}@${entity.x},${entity.y},${elevation};`;
        }
        if (this.model && signature === this.mapSignature) {
            this.readLevelRooms();
            // Other tools set the opacity of the entities (the dimming of the map editor): set it again.
            for (const level of this.levels) level.show(level.alpha);
            for (const stair of this.stairDrawings) {
                if (stair.shown !== 1) stair.entity.setAlpha(stair.shown);
            }
            return;
        }
        this.mapSignature = signature;
        const model = FloorModel.fromPlaced(
            pieces.map(({ entity, elevation }) => {
                const prefab = entity.getPrefab();
                return {
                    x: entity.x,
                    y: entity.y,
                    collectionName: prefab.collectionName,
                    prefabId: prefab.id,
                    elevation,
                };
            }),
        );
        this.model = model;
        const built = model.getLevels();
        this.onLevels(built);
        const viewed = get(floorLevelViewedStore);
        if (viewed !== undefined && viewed !== 0 && !built.includes(viewed)) floorLevelViewedStore.set(undefined);
        const stairBoxes = model.getStairs().map((placed) => this.stairScreenBox(placed));
        const alphas = new Map(this.levels.map((level) => [level.key, level.alpha]));
        const seeThroughBefore = new Map(this.levels.map((level) => [level.key, level.seeThrough]));
        this.levels.length = 0;
        // One drawing per floor: the storeys of two buildings do not show through together.
        const groups = floorGroups(model);
        const groupOf = new Map<string, FloorGroup>();
        for (const group of groups) {
            for (const cell of group.cells) groupOf.set(`${group.level}:${cell.x}:${cell.y}`, group);
        }
        /** The floor of an altitude under a point of the screen: its altitude further south on the ground. */
        const groupAt = (elevation: number, x: number, y: number): FloorGroup | undefined =>
            groupOf.get(`${elevation}:${Math.floor(x / TILE)}:${Math.floor((y + elevation) / TILE)}`);
        for (const group of groups) {
            const elevation = group.level;
            const normal: FloorEntity[] = [];
            const overStairs: FloorEntity[] = [];
            for (const { entity, piece, elevation: at } of pieces) {
                if (piece.kind !== "slab" || at !== elevation) continue;
                if (groupAt(elevation, entity.x + TILE / 2, entity.y + TILE / 2) !== group) continue;
                const covers = stairBoxes.some(
                    (box) =>
                        entity.x < box.x + box.width &&
                        box.x < entity.x + TILE &&
                        entity.y < box.y + box.height &&
                        box.y < entity.y + TILE,
                );
                (covers ? overStairs : normal).push(entity);
            }
            // What stands on this floor: by the foot of its image, by its top left corner for want of better.
            const objects = standing
                .filter(({ entity, elevation: at }) => {
                    if (at !== elevation) return false;
                    const width = entity.displayWidth ?? TILE;
                    const height = entity.displayHeight ?? TILE;
                    const found =
                        groupAt(elevation, entity.x + width / 2, entity.y + height - 1) ??
                        groupAt(elevation, entity.x + width / 2, entity.y + height / 2) ??
                        groupAt(elevation, entity.x, entity.y);
                    // An object of that altitude over no floor at all goes with the first floor of the altitude.
                    return found ? found === group : groups.find((other) => other.level === elevation) === group;
                })
                .map((item) => item.entity);
            // The objects are only touched while their floor shows through, and once when it is opaque again: the map
            // editor dims them by itself.
            let objectsShown = 1;
            const level: LevelDrawing = {
                key: group.key,
                elevation,
                cells: new Set(group.cells.map((cell) => `${cell.x}:${cell.y}`)),
                roomsUnder: new Set(),
                roomsCovered: new Set(),
                alpha: alphas.get(group.key) ?? 1,
                seeThrough: seeThroughBefore.get(group.key) ?? true,
                slabEntities: [...normal, ...overStairs],
                show: (alpha: number) => {
                    // A slab in the window around the avatar outdoors is fainter than its floor (see fadeWindow).
                    const local = (entity: FloorEntity): number => this.localFade.get(entity) ?? 1;
                    for (const entity of normal) entity.setAlpha(alpha * local(entity));
                    for (const entity of overStairs) {
                        entity.setAlpha((level.seeThrough ? alpha * OVER_STAIR_ALPHA : alpha) * local(entity));
                    }
                    this.railings.setAlpha(group.key, alpha);
                    if (alpha !== 1 || objectsShown !== 1) {
                        for (const entity of objects) entity.setAlpha(alpha);
                        objectsShown = alpha;
                    }
                },
            };
            this.levels.push(level);
        }
        // The stairs let the avatar show through when it walks under or behind them.
        const stairAlphas = new Map(this.stairDrawings.map((stair) => [stair.entity, stair.alpha]));
        this.stairDrawings = pieces
            .filter(({ piece }) => piece.kind === "stair")
            .map(({ entity, piece, elevation }) => ({
                entity,
                ownDepth: floorPieceDepth(piece, entity.x, entity.y, elevation),
                groundBottom: this.stairGroundBottom(piece, entity, elevation),
                base: elevation,
                top: elevation + (piece.kind === "stair" ? piece.rise : 0),
                // The floor it stands on: the one under the tiles it covers, or under the tile before its first step.
                floor: elevation > 0 ? this.stairFloor(model, entity, elevation, groupOf) : undefined,
                alpha: stairAlphas.get(entity) ?? 1,
                shown: 1,
            }));
        // The railings: along every side of a floor that gives on the void, but where a stair or a wall is.
        const walls: RailingWall[] = [];
        for (const base of new Set(placedWalls.map((wall) => wall.elevation ?? 0))) {
            for (const wall of modelFromPlacedPrefabs(levelItems(placedWalls, base)).getWalls()) {
                walls.push({ orientation: wall.orientation, x: wall.x, y: wall.y, height: wall.height, base });
            }
        }
        this.railings.draw(
            floorRailings(model, railingClosers(walls)),
            (edge) => groupOf.get(`${edge.level}:${edge.x}:${edge.y}`)?.key ?? "",
        );
        this.readLevelRooms();
        for (const level of this.levels) level.show(level.alpha);
        this.scene.markDirty();
    }

    /** The floor a stair placed on the map stands on, from the stair of the model drawn where its image is. */
    private stairFloor(
        model: FloorModel,
        entity: FloorEntity,
        base: number,
        groupOf: ReadonlyMap<string, FloorGroup>,
    ): LevelDrawing | undefined {
        const placed = model.getStairs().find((stair) => {
            if (stair.base !== base) return false;
            const box = this.stairScreenBox(stair);
            return Math.abs(box.x - entity.x) < 2 && Math.abs(box.y - entity.y) < 2;
        });
        if (!placed) return undefined;
        const cells = [stairEnds(placed).bottom];
        const g = placed.ground;
        for (let x = Math.floor(g.x / TILE); x * TILE < g.x + g.width; x++) {
            for (let y = Math.floor(g.y / TILE); y * TILE < g.y + g.height; y++) cells.push({ x, y });
        }
        for (const cell of cells) {
            const key = groupOf.get(`${base}:${cell.x}:${cell.y}`)?.key;
            if (key !== undefined) return this.levels.find((level) => level.key === key);
        }
        return undefined;
    }

    /** What a stair shows on the screen. */
    private stairScreenBox(placed: PlacedStair): { x: number; y: number; width: number; height: number } {
        const g = placed.ground;
        const rise = placed.top - placed.base;
        return placed.shape.direction === "s"
            ? { x: g.x, y: g.y - placed.base, width: g.width, height: g.height - rise }
            : { x: g.x, y: g.y - rise - placed.base, width: g.width, height: g.height + rise };
    }

    private graphics(depth: number): Phaser.GameObjects.Graphics {
        const drawing = this.scene.add.graphics().setDepth(depth);
        this.drawings.push(drawing);
        return drawing;
    }

    private draw(model: FloorModel): void {
        const stairBoxes = model.getStairs().map((placed) => {
            const g = placed.ground;
            const rise = placed.top - placed.base;
            const direction = placed.shape.direction;
            // What the stair shows on the screen.
            const box =
                direction === "s"
                    ? { x: g.x, y: g.y - placed.base, width: g.width, height: g.height - rise }
                    : { x: g.x, y: g.y - rise - placed.base, width: g.width, height: g.height + rise };
            this.drawStair(placed, box);
            return box;
        });

        for (const elevation of model.getLevels()) {
            const normal = this.graphics(floorDepth(elevation, 0) - 1);
            const overStairs = this.graphics(floorDepth(elevation, 0) - 1).setAlpha(OVER_STAIR_ALPHA);
            const level = {
                elevation,
                key: String(elevation),
                cells: new Set<string>(),
                roomsUnder: new Set<number>(),
                roomsCovered: new Set<number>(),
                alpha: 1,
                seeThrough: true,
                slabEntities: [],
                slabs: normal,
                overStairs,
                show: (alpha: number) => {
                    normal.setAlpha(alpha);
                    overStairs.setAlpha(alpha * OVER_STAIR_ALPHA);
                },
            };
            this.levels.push(level);
            for (const slab of model.getSlabs()) {
                if (slab.elevation !== elevation) continue;
                const x = slab.x * TILE;
                const y = slab.y * TILE - elevation;
                const overStair = stairBoxes.some(
                    (box) => x < box.x + box.width && box.x < x + TILE && y < box.y + box.height && box.y < y + TILE,
                );
                const drawing = overStair ? level.overStairs : level.slabs;
                drawing.fillStyle(0xbfa97c, 1);
                drawing.fillRect(x, y, TILE, TILE);
                drawing.lineStyle(1, 0x9c875f, 1);
                drawing.strokeRect(x, y, TILE, TILE);
                // The thickness of the slab where the floor ends towards the south, and the railing on its edges.
                if (!model.hasSlab(elevation, slab.x, slab.y + 1)) {
                    drawing.fillStyle(0x6f5d3e, 1);
                    drawing.fillRect(x, y + TILE, TILE, 8);
                }
                drawing.lineStyle(2, 0x3f3421, 1);
                if (!model.hasSlab(elevation, slab.x, slab.y - 1)) drawing.lineBetween(x, y, x + TILE, y);
                if (!model.hasSlab(elevation, slab.x - 1, slab.y)) drawing.lineBetween(x, y, x, y + TILE);
                if (!model.hasSlab(elevation, slab.x + 1, slab.y)) drawing.lineBetween(x + TILE, y, x + TILE, y + TILE);
            }
        }
        this.scene.markDirty();
    }

    private drawStair(placed: PlacedStair, box: { x: number; y: number; width: number; height: number }): void {
        const g = placed.ground;
        const rise = placed.top - placed.base;
        const direction = placed.shape.direction;
        // A stair is sorted by its foot, like an object standing on its floor.
        const drawing = this.graphics(floorDepth(placed.base, g.y + g.height - placed.base));
        const steps = 12;
        if (direction === "e" || direction === "o") {
            const y0 = g.y - placed.base;
            for (let i = 0; i < steps; i++) {
                // Step i from the foot: its front, down to the floor, then its top.
                const up = (rise * (i + 1)) / steps;
                const x = direction === "e" ? g.x + (g.width * i) / steps : g.x + g.width - (g.width * (i + 1)) / steps;
                drawing.fillStyle(i % 2 === 0 ? 0x8d7b5a : 0xa8956e, 1);
                drawing.fillRect(x, y0 - up, g.width / steps + 0.5, g.height + up);
                drawing.fillStyle(i % 2 === 0 ? 0xc9b68c : 0xd8c79f, 1);
                drawing.fillRect(x, y0 - up, g.width / steps + 0.5, g.height);
            }
            return;
        }
        for (let i = 0; i < steps; i++) {
            drawing.fillStyle(i % 2 === 0 ? 0xc9b68c : 0xa8956e, 1);
            drawing.fillRect(box.x, box.y + (box.height * i) / steps, box.width, box.height / steps + 0.5);
        }
        drawing.lineStyle(2, 0x5b4c33, 1);
        drawing.strokeRect(box.x, box.y, box.width, box.height);
    }
}
