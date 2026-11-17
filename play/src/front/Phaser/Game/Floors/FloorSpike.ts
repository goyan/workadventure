import * as Phaser from "phaser";
import type { TileBarriers } from "../../../Utils/TileBarriers";
import { MAP_LAYER_TILE_SIZE } from "../MapEditor/MapLayer/MapLayerCatalog";
import { FloorModel } from "../MapEditor/MapLayer/FloorModel";
import type { PlacedStair } from "../MapEditor/MapLayer/FloorModel";
import { FLOOR_PREVIEW_DEPTH, floorDepth } from "../MapEditor/MapLayer/FloorDepth";
import { floorStep } from "../MapEditor/MapLayer/FloorWalk";
import type { FloorWalkState, StairSide } from "../MapEditor/MapLayer/FloorWalk";
import { parseFloorPiece } from "../MapEditor/MapLayer/MapLayerFloors";
import type { FloorPiece, StairShape } from "../MapEditor/MapLayer/MapLayerFloors";
import { floorZToShare } from "./FloorProtocol";

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
/** Opacity of a floor the avatar is under, or climbs to. */
const HIDDEN_ALPHA = 0.35;
/** Opacity of the slabs that hide a stair. */
const OVER_STAIR_ALPHA = 0.55;
const FADE_MS = 200;
const TILE = MAP_LAYER_TILE_SIZE;

interface LevelDrawing {
    elevation: number;
    alpha: number;
    /** Shows the slabs of the level at this opacity; the ones drawn over a stair let it show through. */
    show(alpha: number): void;
}

/** A slab or a stair placed on the map (an `Entity` fits). */
export interface FloorEntity {
    x: number;
    y: number;
    setAlpha(alpha: number): unknown;
    getPrefab(): { collectionName: string; id: string };
    getEntityData(): { elevation?: number };
}

/** Opacity of the floors above the one being edited, in the map editor. */
const EDITOR_ABOVE_ALPHA = 0.3;
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

export class FloorSpike {
    private model: FloorModel | undefined;
    private state: FloorWalkState = { elevation: 0 };
    private prev: { x: number; y: number } | undefined;
    private readonly levels: LevelDrawing[] = [];
    private readonly drawings: Phaser.GameObjects.Graphics[] = [];
    private readonly label: Phaser.GameObjects.Text;
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
    ) {
        this.label = scene.add.text(0, 0, "", { fontSize: "10px", color: "#ffffff", backgroundColor: "#000000" });
        this.label.setDepth(FLOOR_PREVIEW_DEPTH);
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.step);
    }

    public destroy(): void {
        this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.step);
        for (const drawing of this.drawings) drawing.destroy();
        this.label.destroy();
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

        this.label.setVisible(this.origin !== undefined);
        this.label.setPosition(result.p.x + 14, result.p.y - 44);
        this.label.setText(`z=${Math.round(this.state.elevation)}${this.state.stair === undefined ? "" : " escalier"}`);
    };

    /** A floor over the avatar, or the one it climbs to, lets it show through. */
    private fade(model: FloorModel, p: { x: number; y: number }, delta: number): void {
        const climbingTo = this.state.stair === undefined ? undefined : model.getStairs()[this.state.stair]?.top;
        const editor = this.editor();
        for (const level of this.levels) {
            let target = 1;
            if (editor.open) {
                // In the editor, the floors above the one being edited let it show through.
                if (level.elevation > editor.level) target = EDITOR_ABOVE_ALPHA;
            } else if (level.elevation > this.state.elevation + 1) {
                const hides = model.getSlabs().some((slab) => {
                    if (slab.elevation !== level.elevation) return false;
                    const top = slab.y * TILE - slab.elevation;
                    // The avatar is about 36 px high above its feet, 24 px wide.
                    return (
                        p.x + 12 > slab.x * TILE && p.x - 12 < (slab.x + 1) * TILE && p.y > top && p.y - 36 < top + TILE
                    );
                });
                if (hides || climbingTo === level.elevation) target = HIDDEN_ALPHA;
            }
            if (level.alpha === target) continue;
            const change = ((1 - HIDDEN_ALPHA) * delta) / FADE_MS;
            level.alpha =
                target > level.alpha ? Math.min(target, level.alpha + change) : Math.max(target, level.alpha - change);
            level.show(level.alpha);
            this.scene.markDirty();
        }
    }

    /**
     * Reads the slabs and the stairs placed on the map; rebuilds the floors when they changed. The opacity of a level
     * is then set on its entities.
     */
    private readMap(): void {
        const pieces: { entity: FloorEntity; piece: FloorPiece; elevation: number }[] = [];
        const standing: { entity: FloorEntity; elevation: number }[] = [];
        let signature = "";
        for (const entity of this.readEntities()) {
            const prefab = entity.getPrefab();
            const piece = parseFloorPiece(prefab.collectionName, prefab.id);
            const elevation = entity.getEntityData().elevation ?? 0;
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
            // Other tools set the opacity of the entities (the dimming of the map editor): set it again.
            for (const level of this.levels) level.show(level.alpha);
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
        this.onLevels(model.getLevels());
        const stairBoxes = model.getStairs().map((placed) => this.stairScreenBox(placed));
        const alphas = new Map(this.levels.map((level) => [level.elevation, level.alpha]));
        this.levels.length = 0;
        for (const elevation of model.getLevels()) {
            const normal: FloorEntity[] = [];
            const overStairs: FloorEntity[] = [];
            for (const { entity, piece, elevation: at } of pieces) {
                if (piece.kind !== "slab" || at !== elevation) continue;
                const covers = stairBoxes.some(
                    (box) =>
                        entity.x < box.x + box.width &&
                        box.x < entity.x + TILE &&
                        entity.y < box.y + box.height &&
                        box.y < entity.y + TILE,
                );
                (covers ? overStairs : normal).push(entity);
            }
            const objects = standing.filter((item) => item.elevation === elevation).map((item) => item.entity);
            // The objects are only touched while their floor shows through, and once when it is opaque again: the map
            // editor dims them by itself.
            let objectsShown = 1;
            const level = {
                elevation,
                alpha: alphas.get(elevation) ?? 1,
                show: (alpha: number) => {
                    for (const entity of normal) entity.setAlpha(alpha);
                    for (const entity of overStairs) entity.setAlpha(alpha * OVER_STAIR_ALPHA);
                    if (alpha !== 1 || objectsShown !== 1) {
                        for (const entity of objects) entity.setAlpha(alpha);
                        objectsShown = alpha;
                    }
                },
            };
            level.show(level.alpha);
            this.levels.push(level);
        }
        this.scene.markDirty();
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
                alpha: 1,
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
