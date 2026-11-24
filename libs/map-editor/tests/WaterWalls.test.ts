import { describe, expect, it } from "vitest";
import { cellKey } from "../src/Terrain/TerrainGrid";
import { waterWallsOf } from "../src/Terrain/WaterWalls";
import type { WAMFileFormat } from "../src/types";

const piece = (collectionName: string, name: string, x: number, y: number, extra: Record<string, unknown> = {}) => ({
    x,
    y,
    prefabRef: { collectionName, id: `${collectionName}:${name}:Default:Down` },
    ...extra,
});
const wam = (entities: unknown[]): WAMFileFormat =>
    ({
        version: "2.1.0",
        mapUrl: "m.tmj",
        areas: [],
        entityCollections: [],
        entities: Object.fromEntries(entities.map((entity, index) => [`e${index}`, entity])),
    }) as WAMFileFormat;
const keys = (set: ReadonlySet<string>): string[] => [...set].sort();

describe("waterWallsOf", () => {
    it("is empty on a map without walls", () => {
        const walls = waterWallsOf(undefined);
        expect(walls.east.size + walls.south.size).toBe(0);
        expect(waterWallsOf(wam([])).signature).toBe(walls.signature);
    });

    it("closes the foot of a horizontal wall: the south side of its tile, two cells wide", () => {
        // A wall on the line 3, over the column 2: its sprite fills the tile (2, 3), its foot is the bottom of it.
        const walls = waterWallsOf(wam([piece("Carte Murs", "facade-blanc-mid", 64, 96)]));
        expect(keys(walls.south)).toEqual([cellKey(4, 7), cellKey(5, 7)]);
        expect(walls.east.size).toBe(0);
    });

    it("reads the end pieces (drawn 6 px further left) and the high walls (drawn higher) at their foot", () => {
        const left = waterWallsOf(wam([piece("Carte Murs", "facade-brique-left", 64 - 6, 96)]));
        const high = waterWallsOf(wam([piece("Carte Murs", "facade-gris-mid-h3", 64, 96 - 64)]));
        expect(keys(left.south)).toEqual([cellKey(4, 7), cellKey(5, 7)]);
        expect(keys(high.south)).toEqual([cellKey(4, 7), cellKey(5, 7)]);
    });

    it("closes a vertical wall: the west side of the tile under its first vertex, two cells high", () => {
        // A wall on the line 3, from the vertex (3, 2): it stops the feet on the row 3, between the columns 2 and 3.
        const walls = waterWallsOf(wam([piece("Carte Murs", "mur-vertical-blanc", 3 * 32 - 6, 2 * 32 + 12)]));
        expect(keys(walls.east)).toEqual([cellKey(5, 6), cellKey(5, 7)]);
        expect(walls.south.size).toBe(0);
    });

    it("holds the water at a window as at a wall, and lets it through a door, open or closed", () => {
        const window = waterWallsOf(wam([piece("Carte Fenêtres", "fenetre-blanc-mid", 64, 96)]));
        expect(keys(window.south)).toEqual([cellKey(4, 7), cellKey(5, 7)]);
        const doors = waterWallsOf(
            wam([
                piece("Carte Portes", "porte-h-blanc-g", 64, 96),
                piece("Carte Portes", "porte-v-blanc-haut", 64, 96),
            ]),
        );
        expect(doors.east.size + doors.south.size).toBe(0);
    });

    it("leaves out what is not a wall of the ground: other objects, the walls of a raised floor, broken pieces", () => {
        const walls = waterWallsOf(
            wam([
                piece("Mobilier", "facade-blanc-mid", 64, 96),
                piece("Carte Murs Paliers", "facade-blanc-mid", 64, 96),
                piece("Carte Murs", "facade-blanc-mid", 64, 96, { elevation: 52 }),
                piece("Carte Murs", "raccord-NE", 64, 96),
                piece("Carte Murs", "facade-blanc-mid", 70, 96),
                { x: 0, y: 0 },
            ]),
        );
        expect(walls.east.size + walls.south.size).toBe(0);
    });

    it("has a signature that changes with the walls and not with their order", () => {
        const a = piece("Carte Murs", "facade-blanc-mid", 64, 96);
        const b = piece("Carte Murs", "mur-vertical-blanc", 3 * 32 - 6, 2 * 32 + 12);
        expect(waterWallsOf(wam([a, b])).signature).toBe(waterWallsOf(wam([b, a])).signature);
        expect(waterWallsOf(wam([a])).signature).not.toBe(waterWallsOf(wam([a, b])).signature);
    });
});
