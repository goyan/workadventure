import { describe, expect, it } from "vitest";
import {
    MAP_LAYER_FLOOR_SLAB_COLLECTION,
    floorElevation,
    floorLevelTiles,
    parseFloorPiece,
    slabPrefabName,
    stairElevationAt,
    stairGroundBox,
    stairPrefabName,
    stairRun,
    stairScreenBox,
} from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerFloors";

describe("raised floors of the map layer", () => {
    it("puts a floor on the top of the walls of its height", () => {
        // A wall of height N shows a face of 20 + 32 x (N - 1) px under its cap.
        expect(floorElevation(2)).toBe(52);
        expect(floorElevation(3)).toBe(84);
        expect(floorElevation(4)).toBe(116);
    });

    it("tells a floor as the height in tiles of the walls that carry it", () => {
        expect(floorLevelTiles(52)).toBe("2");
        expect(floorLevelTiles(84)).toBe("3");
        expect(floorLevelTiles(116)).toBe("4");
        // A floor on walls standing on another floor: the heights of the walls, one over the other.
        expect(floorLevelTiles(104)).toBe("2+2");
        expect(floorLevelTiles(136)).toBe("2+3");
        expect(floorLevelTiles(168)).toBe("2+4");
        expect(floorLevelTiles(156)).toBe("2+2+2");
        // Anything else: its altitude in tiles.
        expect(floorLevelTiles(148)).toBe("5");
        expect(floorLevelTiles(100)).toBe("3.5");
    });

    it("names the slabs and the stairs", () => {
        expect(slabPrefabName("parquet-clair")).toBe("dalle-parquet-clair");
        expect(stairPrefabName({ direction: "n", width: 1, rise: 52, open: false })).toBe("escalier-n-l1-h2");
        expect(stairPrefabName({ direction: "o", width: 2, rise: 84, open: true })).toBe("escalier-o-l2-h3-vide");
    });

    it("reads back what it names, and nothing else", () => {
        const id = (name: string) => `${MAP_LAYER_FLOOR_SLAB_COLLECTION}:${name}:Default:Down`;
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("dalle-moquette-grise"))).toEqual({
            kind: "slab",
            family: "moquette-grise",
        });
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-e-l2-h4-vide"))).toEqual({
            kind: "stair",
            direction: "e",
            width: 2,
            rise: 116,
            open: true,
        });
        // A wall of height 1 carries no floor, a stair is 1 or 2 tiles wide, and other collections are not read.
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-n-l1-h1"))).toBeUndefined();
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-n-l3-h2"))).toBeUndefined();
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("dalle-inconnue"))).toBeUndefined();
        expect(parseFloorPiece("Carte Sols", "Carte Sols:dalle-parquet-clair:Default:Down")).toBeUndefined();
    });

    it("names the short stairs that join two floors by the tiles they go up", () => {
        // Between the tops of walls of 2 and 3 tiles: 32 px; of 2 and 4: 64 px.
        expect(stairPrefabName({ direction: "n", width: 1, rise: 32, open: false })).toBe("escalier-n-l1-m1");
        expect(stairPrefabName({ direction: "e", width: 2, rise: 64, open: true })).toBe("escalier-e-l2-m2-vide");
        const id = `${MAP_LAYER_FLOOR_SLAB_COLLECTION}:escalier-s-l1-m2:Default:Down`;
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id)).toEqual({
            kind: "stair",
            direction: "s",
            width: 1,
            rise: 64,
            open: false,
        });
        expect(stairRun("n", 32)).toBe(1);
        expect(stairRun("n", 64)).toBe(2);
        expect(stairRun("s", 64)).toBe(3);
    });

    it("gives a stair one tile of run per tile of height, one more towards the south", () => {
        expect(stairRun("n", 52)).toBe(2);
        expect(stairRun("e", 84)).toBe(3);
        expect(stairRun("o", 116)).toBe(4);
        // Going south, the avatar goes down the screen less than it goes up: the run must be longer than the rise.
        expect(stairRun("s", 52)).toBe(3);
        expect(stairRun("s", 116)).toBe(5);
    });

    it("lays the stair on the ground from the tile of its foot", () => {
        const foot = { x: 10, y: 20 };
        // North: the foot is the southernmost tile; a stair 2 wide spreads to the east.
        expect(stairGroundBox({ direction: "n", width: 2, rise: 52, open: false }, foot)).toEqual({
            x: 320,
            y: 608,
            width: 64,
            height: 64,
        });
        expect(stairGroundBox({ direction: "s", width: 1, rise: 52, open: false }, foot)).toEqual({
            x: 320,
            y: 640,
            width: 32,
            height: 96,
        });
        // East and west: a stair 2 wide spreads to the south.
        expect(stairGroundBox({ direction: "e", width: 2, rise: 52, open: false }, foot)).toEqual({
            x: 320,
            y: 640,
            width: 64,
            height: 64,
        });
        expect(stairGroundBox({ direction: "o", width: 1, rise: 84, open: false }, foot)).toEqual({
            x: 256,
            y: 640,
            width: 96,
            height: 32,
        });
    });

    it("draws a stair going north longer and a stair going south shorter than its run", () => {
        const foot = { x: 10, y: 20 };
        expect(stairScreenBox({ direction: "n", width: 1, rise: 52, open: false }, foot)).toEqual({
            x: 320,
            y: 608 - 52,
            width: 32,
            height: 64 + 52,
        });
        expect(stairScreenBox({ direction: "s", width: 1, rise: 52, open: false }, foot)).toEqual({
            x: 320,
            y: 640,
            width: 32,
            height: 96 - 52,
        });
    });

    it("tells the altitude along the stair, from its foot to its top", () => {
        const foot = { x: 10, y: 20 };
        const north = { direction: "n", width: 1, rise: 52, open: false } as const;
        // On the ground: foot at y = 672, top at y = 608.
        expect(stairElevationAt(north, foot, { x: 336, y: 672 })).toBe(0);
        expect(stairElevationAt(north, foot, { x: 336, y: 640 })).toBe(26);
        expect(stairElevationAt(north, foot, { x: 336, y: 608 })).toBe(52);
        const west = { direction: "o", width: 1, rise: 84, open: false } as const;
        // Foot at x = 352 (east end), top at x = 256.
        expect(stairElevationAt(west, foot, { x: 352, y: 650 })).toBe(0);
        expect(stairElevationAt(west, foot, { x: 256, y: 650 })).toBe(84);
        // Beyond its ends, the altitude of the end.
        expect(stairElevationAt(west, foot, { x: 100, y: 650 })).toBe(84);
    });

    it("names and reads the new stairs (-v2), short ones, before the open side", () => {
        const id = (name: string) => `${MAP_LAYER_FLOOR_SLAB_COLLECTION}:${name}:Default:Down`;
        expect(stairPrefabName({ direction: "n", width: 1, rise: 52, open: false, short: true })).toBe(
            "escalier-n-l1-h2-v2",
        );
        expect(stairPrefabName({ direction: "e", width: 2, rise: 116, open: true, short: true })).toBe(
            "escalier-e-l2-h4-v2-vide",
        );
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-s-l1-h3-v2"))).toEqual({
            kind: "stair",
            direction: "s",
            width: 1,
            rise: 84,
            open: false,
            short: true,
        });
        // The stairs already placed keep their name and shape: no `short` field.
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-n-l1-h2"))).not.toHaveProperty("short");
        expect(parseFloorPiece(MAP_LAYER_FLOOR_SLAB_COLLECTION, id("escalier-n-l1-h2-vide-v2"))).toBeUndefined();
    });

    it("gives a new stair one tile of run north, east and west; going south, the run it always had", () => {
        expect(stairRun("n", 52, true)).toBe(1);
        expect(stairRun("e", 116, true)).toBe(1);
        expect(stairRun("o", 84, true)).toBe(1);
        expect(stairRun("s", 84, true)).toBe(stairRun("s", 84));
        const foot = { x: 10, y: 20 };
        const north = { direction: "n", width: 1, rise: 52, open: false, short: true } as const;
        expect(stairGroundBox(north, foot)).toEqual({ x: 320, y: 640, width: 32, height: 32 });
        // On the screen: one tile plus its rise.
        expect(stairScreenBox(north, foot)).toEqual({ x: 320, y: 640 - 52, width: 32, height: 32 + 52 });
        // Up its whole rise over one tile.
        expect(stairElevationAt(north, foot, { x: 336, y: 672 })).toBe(0);
        expect(stairElevationAt(north, foot, { x: 336, y: 656 })).toBe(26);
        expect(stairElevationAt(north, foot, { x: 336, y: 640 })).toBe(52);
    });

    it("names and reads a glass slab, a slab that is no floor of the ground", () => {
        expect(slabPrefabName("verre")).toBe("dalle-verre");
        expect(parseFloorPiece("Carte Paliers", "Carte Paliers:dalle-verre:Default:Down")).toEqual({
            kind: "slab",
            family: "verre",
        });
        // The floors of the ground have no glass.
        expect(parseFloorPiece("Carte Sols", "Carte Sols:sol-verre-uni:Default:Down")).toBeUndefined();
    });
});
