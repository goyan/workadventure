import { describe, expect, it } from "vitest";
import { RAISED_FLOOR_COLLECTION, bridgeTilesOf, bridgesOf, dryOnBridges } from "../src/Terrain/Bridges";
import type { WAMFileFormat } from "../src/types";

const piece = (name: string, x: number, y: number, elevation?: number, collectionName = RAISED_FLOOR_COLLECTION) => ({
    x,
    y,
    prefabRef: { collectionName, id: `${collectionName}:${name}:Default:Down` },
    ...(elevation === undefined ? {} : { elevation }),
});
const wamOf = (...entities: ReturnType<typeof piece>[]): Pick<WAMFileFormat, "entities"> => ({
    entities: Object.fromEntries(entities.map((entity, index) => [`e${index}`, entity])),
});
/** A deck 20 px up over the tiles 4 and 5 of the row 10, a ramp at each end (tiles 3 and 6). */
const bridge = [
    piece("rampe-e-l1-h1", 96, 300),
    piece("dalle-bois", 128, 300, 20),
    piece("dalle-bois", 160, 300, 20),
    piece("rampe-o-l1-h1", 192, 300),
];

describe("bridgesOf", () => {
    it("gives the tiles of the ground under a deck and under the ramps that go up to it", () => {
        expect(RAISED_FLOOR_COLLECTION).toBe("Carte Paliers");
        expect([...bridgeTilesOf(wamOf(...bridge))].sort()).toEqual(["3,10", "4,10", "5,10", "6,10"]);
    });

    it("tells how high one walks: the deck on its slabs, a share of it along a ramp, nothing elsewhere", () => {
        const bridges = bridgesOf(wamOf(...bridge));
        const elevationAt = (x: number, y: number): number => bridges.elevationAt(x, y);
        expect(elevationAt(140, 330)).toBe(20);
        expect(elevationAt(96, 330)).toBe(0);
        expect(elevationAt(112, 330)).toBe(10);
        expect(elevationAt(208, 330)).toBe(10);
        expect(elevationAt(140, 290)).toBe(0);
    });

    it("reads a stair of any kind: going north, two tiles wide, short, with an open side", () => {
        // Going north from the tile (2, 6), 52 px up over one tile: its image starts 52 px further north.
        const tiles = bridgeTilesOf(
            wamOf(piece("escalier-n-l2-h2-v2-vide", 64, 140), piece("dalle-parquet-clair", 64, 108, 52)),
        );
        expect([...tiles].sort()).toEqual(["2,5", "2,6", "3,6"]);
    });

    it("leaves out a floor no stair of the ground reaches, a slab apart, and the other collections", () => {
        expect(bridgeTilesOf(wamOf(piece("dalle-bois", 128, 300, 20))).size).toBe(0);
        expect(bridgeTilesOf(wamOf(piece("rampe-e-l1-h1", 96, 300))).size).toBe(0);
        const apart = bridgeTilesOf(wamOf(...bridge, piece("dalle-bois", 320, 300, 20)));
        expect(apart.has("10,10")).toBe(false);
        // A deck at another height than the ramp goes up to, and a stair standing on a floor.
        expect(bridgeTilesOf(wamOf(piece("rampe-e-l1-h1", 96, 300), piece("dalle-bois", 128, 268, 52))).size).toBe(0);
        expect(bridgeTilesOf(wamOf(piece("rampe-e-l1-h1", 96, 280, 20), piece("dalle-bois", 128, 280, 40))).size).toBe(
            0,
        );
        expect(
            bridgeTilesOf(wamOf(...bridge.map((entity) => piece("pont", entity.x, entity.y, 0, "Carte Ponts")))).size,
        ).toBe(0);
        expect(bridgeTilesOf(undefined).size).toBe(0);
    });
});

describe("dryOnBridges", () => {
    const deep = (): number => 40;

    it("reads no water on the cells of a tile under a bridge, and the water elsewhere", () => {
        const depthAt = dryOnBridges(deep, new Set(["2,3"]));
        expect(depthAt(4, 6)).toBe(0);
        expect(depthAt(5, 7)).toBe(0);
        expect(depthAt(6, 6)).toBe(40);
        expect(depthAt(4, 5)).toBe(40);
        expect(depthAt(-1, -1)).toBe(40);
    });

    it("is the water itself on a map without a bridge", () => {
        expect(dryOnBridges(deep, new Set())).toBe(deep);
    });
});
