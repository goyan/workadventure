import { describe, expect, it } from "vitest";
import { FootstepSurfaces, surfaceOfFloor } from "./FootstepSurfaces";
import { MAP_LAYER_FLOOR_COLLECTION } from "./MapEditor/MapLayer/MapLayerCatalog";

const floor = (family: string, cellX: number, cellY: number) => ({
    collectionName: MAP_LAYER_FLOOR_COLLECTION,
    prefabId: `${MAP_LAYER_FLOOR_COLLECTION}:sol-${family}-uni:Default:Down`,
    x: cellX * 32,
    y: cellY * 32,
});

describe("surfaceOfFloor", () => {
    it("maps the map layer floor families to a footstep sound", () => {
        expect(surfaceOfFloor("parquet-clair")).toBe("wood");
        expect(surfaceOfFloor("moquette-grise")).toBe("carpet");
        expect(surfaceOfFloor("carrelage-gris")).toBe("stone");
        expect(surfaceOfFloor("pierre-olive")).toBe("stone");
    });
});

describe("FootstepSurfaces", () => {
    const inRoom = (x: number) => x >= 200 && x < 300;

    it("uses the painted floor of the cell, then wood inside a room, then grass outside", () => {
        const surfaces = new FootstepSurfaces(
            () => [floor("parquet-clair", 0, 0), floor("moquette-mauve", 1, 0)],
            inRoom,
        );

        expect(surfaces.surfaceAt(10, 10)).toBe("wood");
        expect(surfaces.surfaceAt(40, 10)).toBe("carpet");
        expect(surfaces.surfaceAt(250, 10)).toBe("wood");
        expect(surfaces.surfaceAt(500, 10)).toBe("grass");
    });

    it("reads the floors again after a while, as they are edited in the map editor", () => {
        let now = 0;
        let floors = [floor("carrelage-gris", 0, 0)];
        const surfaces = new FootstepSurfaces(
            () => floors,
            inRoom,
            () => now,
        );
        expect(surfaces.surfaceAt(10, 10)).toBe("stone");

        floors = [floor("moquette-grise", 0, 0)];
        expect(surfaces.surfaceAt(10, 10)).toBe("stone");
        now = 2000;
        expect(surfaces.surfaceAt(10, 10)).toBe("carpet");
    });
});
