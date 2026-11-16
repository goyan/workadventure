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
    roomsBehind,
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

/** A straight joint (`raccord-EW`, at any height): drawn over the caps of the two facades it joins. */
const isStraight = (wall: FakeWall): boolean => /^raccord-EW(-h\d)?$/.test(wall.name);

/** The walls of a closed room (cells 5 to 8 by 6 to 8) of the given height, with a door of height 1 on its south wall. */
function room(height: WallHeight) {
    const model = new MapLayerModel();
    const bounds = { columns: 20, rows: 20 };
    applyWalls(model, roomWallEdges({ x: 5, y: 6 }, { x: 8, y: 8 }), "gris", bounds, height);
    applyDoor(model, { orientation: "h", x: 7, y: 9 }, bounds);
    return sceneOf(model);
}

/** The pieces of the walls of a model, as fake entities, and the outdoor grid they make. */
function sceneOf(model: MapLayerModel) {
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
        /** A facade of the south wall of the room: the wall in front of the player, which hides the room. */
        facade: () => {
            const found = walls.find((wall) => wall.name.startsWith("facade") && wall.y > INSIDE.y - 64);
            if (!found) throw new Error("no facade");
            return found;
        },
        /** A facade of the north wall of the room: the wall at the back, which hides nothing of the room. */
        backFacade: () => {
            const found = walls.find((wall) => wall.name.startsWith("facade") && wall.y < INSIDE.y - 64);
            if (!found) throw new Error("no back facade");
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

    it("leaves the back wall and the side walls of the room opaque: they hide nothing of it", () => {
        const { fade, walls, facade, backFacade } = setup(3);
        fade.update(WALL_FADE_MS);
        expect(facade().alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
        expect(backFacade().alpha).toBe(1);
        const sides = walls.filter((wall) => wall.name.startsWith("mur-vertical"));
        expect(sides.length).toBeGreaterThan(0);
        expect(sides.every((wall) => wall.alpha === 1)).toBe(true);
    });

    it("fades the high wall the player walks behind, outdoors too, and only near them", () => {
        // The north wall of the room, 3 tiles high: its foot ends at y = 224 and its image starts at y = 128.
        const { fade, walls, backFacade, setPlayer } = setup(3);
        const near = backFacade();
        const far = walls.filter((wall) => wall.name.startsWith("facade") && wall.y === near.y).at(-1);
        if (!far || far === near) throw new Error("the north wall needs two facades");
        // Outdoors, north of the wall, hidden by its face.
        setPlayer({ x: near.x + 16, y: 180 });
        fade.update(WALL_FADE_MS);
        expect(near.alpha).toBeCloseTo(WALL_ROOM_ALPHA, 6);
        // Further along the same wall, more than two tiles and a half away: that part hides nothing of the player.
        setPlayer({ x: near.x + 16 - 200, y: 180 });
        fade.update(WALL_FADE_MS);
        expect(near.alpha).toBe(1);
        // North of the top of the wall: nothing is hidden.
        setPlayer({ x: near.x + 16, y: 100 });
        fade.update(WALL_FADE_MS);
        expect(near.alpha).toBe(1);
        // South of the wall, inside the room: in front of it.
        setPlayer(INSIDE);
        fade.update(WALL_FADE_MS);
        expect(near.alpha).toBe(1);
    });

    it("never fades a wall of height 1 the player walks behind", () => {
        const { fade, walls, setPlayer } = setup(1);
        setPlayer({ x: 6 * 32 + 16, y: 200 });
        fade.update(WALL_FADE_MS);
        expect(walls.every((wall) => wall.alpha === 1)).toBe(true);
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
        // The straight joints are hidden over the caps of their facades (see "pieces drawn over the same cap").
        expect(walls.every((wall) => Math.abs(wall.alpha - (isStraight(wall) ? 0 : WALL_EDIT_ALPHA)) < 1e-6)).toBe(
            true,
        );
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

/** Runs the fade on the walls of `model` with the player at `player`, long enough for every fade to end. */
function settle(model: MapLayerModel, player: { x: number; y: number }) {
    const { walls, grid } = sceneOf(model);
    let at = { ...player };
    const fade = new WallFade(
        () => walls,
        () => grid,
        () => at,
        () => false,
        () => undefined,
    );
    fade.update(WALL_FADE_MS);
    const alphaOf = (predicate: (wall: FakeWall) => boolean): number[] =>
        walls.filter(predicate).map((wall) => wall.alpha);
    return {
        walls,
        alphaOf,
        moveTo: (next: { x: number; y: number }) => {
            at = { ...next };
            fade.update(WALL_FADE_MS);
        },
    };
}

/** A joint of the cap of a vertical wall only: no arm towards the east nor the west (`raccord-NS-h3`). */
const isJointWithoutEastWest = (wall: FakeWall): boolean =>
    wall.name.startsWith("raccord-") && !/[EW]/.test(wall.name.split("-")[1]);

describe("WallFade: vertical walls and their joints", () => {
    it("never counts a piece of a vertical wall in front of a room, a vertical door included", () => {
        const grid = { roomAt: () => 2, roomsTouching: () => new Set([2]), isOutdoorAt: () => false };
        const rect = { x: 0, y: 0, width: 12, height: 12 };
        const verticalDoor: MapLayerPiece = { ...door, orientation: "v", side: "haut" };
        expect(roomsBehind(verticalDoor, rect, grid).size).toBe(0);
        expect(roomsBehind({ kind: "joint", arms: ["N", "S"], height: 3 }, rect, grid).size).toBe(0);
        expect(roomsBehind({ kind: "joint", arms: ["N", "E"], height: 3 }, rect, grid)).toEqual(new Set([2]));
        expect(roomsBehind(door, rect, grid)).toEqual(new Set([2]));
    });

    it("fades the joints of the south wall of a high room with its facades", () => {
        const { fade, walls } = setup(2);
        fade.update(WALL_FADE_MS);
        // The south wall stands on the line 9, raised by 32: its joints are drawn from y = 9 * 32 - 32.
        const southJoints = walls.filter(
            (wall) => wall.name.startsWith("raccord-") && wall.y === 9 * 32 - 32 && !isJointWithoutEastWest(wall),
        );
        expect(southJoints.length).toBeGreaterThan(0);
        // The straight ones are hidden over the caps of the facades, the corners keep the opacity of the wall.
        for (const joint of southJoints) expect(joint.alpha).toBeCloseTo(isStraight(joint) ? 0 : WALL_ROOM_ALPHA, 6);
    });

    it("leaves the joints of the side walls of a high room opaque, like their strips", () => {
        const { fade, walls } = setup(3);
        fade.update(WALL_FADE_MS);
        const sideJoints = walls.filter(isJointWithoutEastWest);
        expect(sideJoints.length).toBeGreaterThan(0);
        expect(sideJoints.every((wall) => wall.alpha === 1)).toBe(true);
    });

    it("fades a high vertical wall only right behind its cap, its joints like its strips", () => {
        const model = new MapLayerModel();
        for (let y = 3; y < 9; y++) model.setWall("v", 12, y, "gris", 3);
        // 40 px east of the line of the wall: beside it, not behind its cap.
        const scene = settle(model, { x: 12 * 32 + 40, y: 150 });
        expect(scene.walls.every((wall) => wall.alpha === 1)).toBe(true);
        // Right behind its cap: the strip of the row 4, drawn from y = 76 to 96, over the body of the avatar.
        scene.moveTo({ x: 12 * 32 + 8, y: 110 });
        expect(scene.alphaOf((wall) => wall.name === "mur-vertical-gris-h3" && wall.y === 4 * 32 + 12 - 64)).toEqual([
            WALL_ROOM_ALPHA,
        ]);
    });
});

describe("WallFade: the high wall the player walks behind", () => {
    it("fades the whole straight wall, joints included, and nothing once the player is north of its top", () => {
        const model = new MapLayerModel();
        for (let x = 2; x < 10; x++) model.setWall("h", x, 10, "gris", 3);
        // Behind its second segment: north of its foot (y = 352), under the top of its image (y = 256).
        const scene = settle(model, { x: 3 * 32 + 16, y: 300 });
        expect(scene.alphaOf((wall) => wall.name.startsWith("facade"))).toEqual(Array(8).fill(WALL_ROOM_ALPHA));
        expect(scene.alphaOf((wall) => wall.name.startsWith("raccord") && !isStraight(wall))).toEqual(
            Array(2).fill(WALL_ROOM_ALPHA),
        );
        expect(scene.alphaOf(isStraight)).toEqual(Array(7).fill(0));
        scene.moveTo({ x: 3 * 32 + 16, y: 200 });
        expect(scene.walls.every((wall) => Math.abs(wall.alpha - 1) < 1e-6)).toBe(true);
    });

    it("never fades through a side wall: only the part of the wall that borders the room of the player", () => {
        // Two high rooms side by side (cells 2 to 4 and 5 to 8, rows 6 to 8), the vertical wall x = 5 between them;
        // their south walls make one straight wall on the line 9.
        const model = new MapLayerModel();
        const bounds = { columns: 20, rows: 20 };
        applyWalls(model, roomWallEdges({ x: 2, y: 6 }, { x: 4, y: 8 }), "gris", bounds, 3);
        applyWalls(model, roomWallEdges({ x: 5, y: 6 }, { x: 8, y: 8 }), "gris", bounds, 3);
        // In the left room, on its last row, less than a tile from the south facade of the right room.
        const scene = settle(model, { x: 4 * 32 + 20, y: 8 * 32 + 16 });
        const southFacade = (column: number) => (wall: FakeWall) =>
            wall.name.startsWith("facade") && wall.y === 9 * 32 - 64 && Math.floor((wall.x + 6) / 32) === column;
        for (const column of [2, 3, 4]) expect(scene.alphaOf(southFacade(column))).toEqual([WALL_ROOM_ALPHA]);
        for (const column of [5, 6, 7, 8]) expect(scene.alphaOf(southFacade(column))).toEqual([1]);
        // The wall between the rooms keeps its opacity: its strips and the joints of its cap.
        const shared = (wall: FakeWall): boolean =>
            wall.x === 5 * 32 - 6 && (wall.name.startsWith("mur-vertical") || isJointWithoutEastWest(wall));
        expect(scene.walls.filter(shared).length).toBeGreaterThan(0);
        expect(scene.alphaOf(shared).every((alpha) => alpha === 1)).toBe(true);
    });
});

describe("WallFade: pieces drawn over the same cap", () => {
    /** A straight wall of height 3 on the line 10, columns 2 to 9, alone outdoors. */
    function straightWall() {
        const model = new MapLayerModel();
        for (let x = 2; x < 10; x++) model.setWall("h", x, 10, "gris", 3);
        return model;
    }

    it("hides the straight joints of a faded wall: the caps of the facades under them are the same", () => {
        // Behind the wall: it fades.
        const scene = settle(straightWall(), { x: 3 * 32 + 16, y: 300 });
        expect(scene.alphaOf(isStraight)).toEqual(Array(7).fill(0));
        expect(scene.alphaOf((wall) => wall.name.startsWith("facade"))).toEqual(Array(8).fill(WALL_ROOM_ALPHA));
        // The joints at the ends of the wall draw its closing outline: they keep the opacity of the wall.
        expect(scene.alphaOf((wall) => /^raccord-[EW]-h3$/.test(wall.name))).toEqual([
            WALL_ROOM_ALPHA,
            WALL_ROOM_ALPHA,
        ]);
        // North of the top of the wall: opaque again, every piece at 1.
        scene.moveTo({ x: 3 * 32 + 16, y: 200 });
        expect(scene.walls.every((wall) => Math.abs(wall.alpha - 1) < 1e-6)).toBe(true);
    });

    it("hides them in the editor too, and shows them again only once the facades are opaque", () => {
        const { walls, grid } = sceneOf(straightWall());
        let editorOpen = true;
        const fade = new WallFade(
            () => walls,
            () => grid,
            () => ({ x: 400, y: 600 }),
            () => editorOpen,
            () => undefined,
        );
        fade.update(WALL_FADE_MS);
        expect(walls.filter(isStraight).every((wall) => wall.alpha === 0)).toBe(true);
        expect(walls.find((wall) => wall.name.startsWith("facade"))?.alpha).toBeCloseTo(WALL_EDIT_ALPHA, 6);
        editorOpen = false;
        fade.update(WALL_FADE_MS / 2);
        // Half way: the facades are still see-through, the joints stay hidden (no brighter square over the cap).
        expect(walls.find((wall) => wall.name.startsWith("facade"))?.alpha).toBeLessThan(1);
        expect(walls.filter(isStraight).every((wall) => wall.alpha === 0)).toBe(true);
        fade.update(WALL_FADE_MS / 2);
        expect(walls.every((wall) => Math.abs(wall.alpha - 1) < 1e-6)).toBe(true);
    });
});
