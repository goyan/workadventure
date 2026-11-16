import { describe, expect, it } from "vitest";
import {
    MAP_LAYER_WALL_LIKE_COLLECTIONS,
    mapLayerPieceSize,
    parseMapLayerPrefab,
} from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import type {
    MapLayerPiece,
    WallHeight,
} from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { MapLayerModel } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { computePlacements } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerAutotile";
import {
    applyDoor,
    applyWalls,
    roomWallEdges,
} from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerOperations";
import {
    WALL_EDIT_ALPHA,
    WALL_FADE_MS,
    WALL_ROOM_ALPHA,
    WallFade,
    wallTargetAlpha,
} from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/WallFade";
import type { FadableWall } from "../../../../../../src/front/Phaser/Game/MapEditor/MapLayer/WallFade";
import { OutdoorGrid } from "../../../../../../src/front/Phaser/Game/Outdoor/OutdoorGrid";
import { OUTDOOR_CELL_SIZE, entityOutdoorRect } from "../../../../../../src/front/Phaser/Game/Outdoor/OutdoorTracker";

const facade = (height: WallHeight): MapLayerPiece => ({ kind: "facade", tint: "gris", ends: "mid", height });
const door: MapLayerPiece = {
    kind: "door",
    orientation: "h",
    tint: "gris",
    side: "g",
    frame: 7,
    reverse: false,
    height: 1,
};

describe("wallTargetAlpha", () => {
    it("makes every wall, door and window see-through in the editor, not the floors", () => {
        const editing = { editorOpen: true, playerRoom: undefined };
        expect(wallTargetAlpha(facade(1), new Set(), editing)).toBe(WALL_EDIT_ALPHA);
        expect(wallTargetAlpha(door, new Set(), editing)).toBe(WALL_EDIT_ALPHA);
        expect(wallTargetAlpha({ kind: "floor", family: "parquet-clair", variant: "uni" }, new Set(), editing)).toBe(1);
    });

    it("makes the high walls of the room of the player see-through, and only them", () => {
        const inRoom = { editorOpen: false, playerRoom: 2 };
        expect(wallTargetAlpha(facade(2), new Set([2]), inRoom)).toBe(WALL_ROOM_ALPHA);
        expect(wallTargetAlpha(facade(1), new Set([2]), inRoom)).toBe(1);
        expect(wallTargetAlpha(facade(3), new Set([5]), inRoom)).toBe(1);
        expect(wallTargetAlpha(facade(2), new Set([2]), { editorOpen: false, playerRoom: undefined })).toBe(1);
    });

    it("makes a door follow the wall that carries it", () => {
        const inRoom = { editorOpen: false, playerRoom: 2 };
        expect(wallTargetAlpha(door, new Set([2]), inRoom, 4)).toBe(WALL_ROOM_ALPHA);
        expect(wallTargetAlpha(door, new Set([2]), inRoom, 1)).toBe(1);
    });
});

interface FakeWall extends FadableWall {
    name: string;
}

/** The walls of a closed room (cells 5 to 8 by 6 to 8) of the given height, with a door of height 1 on its south wall. */
function room(height: WallHeight) {
    const model = new MapLayerModel();
    const bounds = { columns: 20, rows: 20 };
    applyWalls(model, roomWallEdges({ x: 5, y: 6 }, { x: 8, y: 8 }), "gris", bounds, height);
    applyDoor(model, { orientation: "h", x: 7, y: 9 }, bounds);
    const walls: FakeWall[] = computePlacements(model)
        .filter((placement) => MAP_LAYER_WALL_LIKE_COLLECTIONS.includes(placement.collectionName))
        .map((placement) => {
            const wall: FakeWall = {
                name: placement.prefabId.split(":")[1],
                x: placement.x,
                y: placement.y,
                alpha: 1,
                setAlpha(alpha: number) {
                    wall.alpha = alpha;
                    return wall;
                },
                getPrefab: () => ({ collectionName: placement.collectionName, id: placement.prefabId }),
            };
            return wall;
        });
    const rects = walls.map((wall) => {
        const prefab = wall.getPrefab();
        const piece = parseMapLayerPrefab(prefab.collectionName, prefab.id);
        if (!piece) throw new Error(`unknown piece ${wall.name}`);
        const { width, height: imageHeight } = mapLayerPieceSize(piece);
        return entityOutdoorRect(
            {
                x: wall.x,
                y: wall.y,
                displayWidth: width,
                displayHeight: imageHeight,
                scaleX: 1,
                scaleY: 1,
                getPrefab: () => ({ ...prefab, imagePath: `${wall.name}.png` }),
            },
            () => ({ width, height: imageHeight }),
        );
    });
    const grid = OutdoorGrid.fromWalls(640, 640, OUTDOOR_CELL_SIZE, rects);
    return { walls, grid };
}

const INSIDE = { x: 6 * 32 + 16, y: 7 * 32 + 16 };
/** On the row of the north wall, behind its face: a wall cell of the grid, not outdoors. */
const ON_NORTH_WALL_ROW = { x: 6 * 32 + 16, y: 6 * 32 + 8 };
const OUTSIDE = { x: 32, y: 32 };

function setup(height: WallHeight) {
    const { walls, grid: firstGrid } = room(height);
    let grid = firstGrid;
    const listed: FakeWall[] = [...walls];
    let player = { ...INSIDE };
    let editorOpen = false;
    const redraws = { count: 0 };
    const fade = new WallFade(
        () => listed,
        () => grid,
        () => player,
        () => editorOpen,
        () => redraws.count++,
    );
    return {
        walls,
        listed,
        fade,
        redraws,
        /** The outdoor tracker computed the grid again, with the same walls. */
        recomputeGrid: () => (grid = room(height).grid),
        setPlayer: (point: { x: number; y: number }) => (player = { ...point }),
        setEditor: (open: boolean) => (editorOpen = open),
        facade: () => {
            const found = walls.find((wall) => wall.name.startsWith("facade"));
            if (!found) throw new Error("no facade");
            return found;
        },
    };
}

describe("WallFade", () => {
    it("fades the high walls of the room of the player in 200 ms", () => {
        const { fade, facade } = setup(2);
        fade.update(WALL_FADE_MS / 2);
        expect(facade().alpha).toBeCloseTo(0.775, 3);
        fade.update(WALL_FADE_MS / 2);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
    });

    it("leaves the walls of height 1 opaque in their room", () => {
        const { fade, walls } = setup(1);
        fade.update(WALL_FADE_MS);
        expect(walls.every((wall) => wall.alpha === 1)).toBe(true);
    });

    it("fades the door of height 1 of a high wall with its wall", () => {
        const { fade, walls } = setup(3);
        fade.update(WALL_FADE_MS);
        const doors = walls.filter((wall) => wall.name.startsWith("porte"));
        expect(doors).toHaveLength(2);
        for (const piece of doors) expect(piece.alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
    });

    it("makes every wall see-through in the editor, and goes back to the room level when it closes", () => {
        const { fade, walls, facade, setEditor } = setup(2);
        setEditor(true);
        fade.update(WALL_FADE_MS);
        expect(walls.every((wall) => Math.abs(wall.alpha - WALL_EDIT_ALPHA) < 1e-6)).toBe(true);
        setEditor(false);
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
    });

    it("keeps the room of the player on the row of a wall, and forgets it outdoors", () => {
        const { fade, facade, setPlayer } = setup(2);
        fade.update(WALL_FADE_MS);
        setPlayer(ON_NORTH_WALL_ROW);
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
        setPlayer(OUTSIDE);
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(1, 6);
    });

    it("puts every wall back to 1 when destroyed", () => {
        const { fade, walls } = setup(2);
        fade.update(WALL_FADE_MS);
        fade.destroy();
        expect(walls.every((wall) => wall.alpha === 1)).toBe(true);
    });

    it("does not fail when a wall goes away during a fade, and gives a new wall its level at once", () => {
        const { fade, listed, walls, facade } = setup(2);
        fade.update(WALL_FADE_MS / 2);
        const removed = listed.splice(0, 1)[0];
        expect(() => fade.update(WALL_FADE_MS / 4)).not.toThrow();
        const alphaWhenRemoved = removed.alpha;
        fade.update(WALL_FADE_MS);
        expect(removed.alpha).toBe(alphaWhenRemoved);
        listed.push(removed);
        removed.setAlpha(1);
        fade.update(1);
        expect(removed.alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
        expect(walls.length).toBeGreaterThan(1);
    });

    it("fades back a wall whose opacity someone else reset", () => {
        const { fade, facade } = setup(2);
        fade.update(WALL_FADE_MS);
        facade().setAlpha(1);
        fade.update(WALL_FADE_MS / 2);
        expect(facade().alpha).toBeCloseTo(0.775, 3);
    });

    it("asks for a redraw while an opacity changes, and not once the walls are still", () => {
        const { fade, redraws } = setup(2);
        fade.update(WALL_FADE_MS / 2);
        expect(redraws.count).toBe(1);
        fade.update(WALL_FADE_MS / 2);
        expect(redraws.count).toBe(2);
        fade.update(WALL_FADE_MS);
        expect(redraws.count).toBe(2);
        fade.destroy();
        expect(redraws.count).toBe(3);
    });

    it("forgets the room kept on the row of a wall when the grid is computed again, its rooms being numbered anew", () => {
        const { fade, facade, setPlayer, recomputeGrid } = setup(2);
        fade.update(WALL_FADE_MS);
        setPlayer(ON_NORTH_WALL_ROW);
        recomputeGrid();
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(1, 6);
        setPlayer(INSIDE);
        recomputeGrid();
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
    });
});
