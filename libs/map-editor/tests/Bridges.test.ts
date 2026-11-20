import { describe, expect, it } from "vitest";
import { BRIDGE_COLLECTION, bridgeTilesOf, dryOnBridges } from "../src/Terrain/Bridges";
import { pavedTilesOf } from "../src/Terrain/Meadow";
import type { WAMFileFormat } from "../src/types";

const piece = (x: number, y: number, collectionName = BRIDGE_COLLECTION, elevation?: number) => ({
    x,
    y,
    prefabRef: { collectionName, id: `${collectionName}:pont-bois-0:Default:Down` },
    ...(elevation === undefined ? {} : { elevation }),
});
const wamOf = (...entities: ReturnType<typeof piece>[]): Pick<WAMFileFormat, "entities"> => ({
    entities: Object.fromEntries(entities.map((entity, index) => [`e${index}`, entity])),
});

describe("bridgeTilesOf", () => {
    it("gives the tiles that carry a piece of a bridge on the ground", () => {
        expect(BRIDGE_COLLECTION).toBe("Carte Ponts");
        expect([...bridgeTilesOf(wamOf(piece(64, 96), piece(70, 100), piece(0, 0)))].sort()).toEqual(["0,0", "2,3"]);
    });

    it("leaves out the other collections, a piece on a raised floor, and a map without objects", () => {
        expect(bridgeTilesOf(wamOf(piece(64, 96, "Carte Sols"), piece(32, 32, BRIDGE_COLLECTION, 64))).size).toBe(0);
        expect(bridgeTilesOf(wamOf(piece(32, 32, BRIDGE_COLLECTION, 0))).has("1,1")).toBe(true);
        expect(bridgeTilesOf(undefined).size).toBe(0);
    });
});

describe("dryOnBridges", () => {
    const deep = (): number => 40;

    it("reads no water on the cells of a tile that carries a bridge, and the water elsewhere", () => {
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

describe("pavedTilesOf", () => {
    it("counts the tiles of a bridge: nothing grows on its deck", () => {
        expect(pavedTilesOf(wamOf(piece(64, 96))).has("2,3")).toBe(true);
    });
});
