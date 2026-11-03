import { describe, expect, it } from "vitest";
import { FootstepSurfaces, surfaceOfFloor } from "./FootstepSurfaces";
import type { FloorEntity } from "./FootstepSurfaces";
import { MAP_LAYER_FLOOR_COLLECTION } from "./MapEditor/MapLayer/MapLayerCatalog";

const mapLayerFloor = (family: string, cellX: number, cellY: number): FloorEntity => ({
    collectionName: MAP_LAYER_FLOOR_COLLECTION,
    prefabId: `${MAP_LAYER_FLOOR_COLLECTION}:sol-${family}-uni:Default:Down`,
    x: cellX * 32,
    y: cellY * 32,
    width: 32,
    height: 32,
});

const tagged = (
    footstepSound: FloorEntity["footstepSound"],
    x: number,
    y: number,
    width = 32,
    height = 32,
): FloorEntity => ({
    collectionName: "Infogène Sols",
    prefabId: "Infogène Sols:sol:Default:Down",
    x,
    y,
    width,
    height,
    footstepSound,
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

    it("plays the footstepSound set in the catalog for the entity under the feet", () => {
        const surfaces = new FootstepSurfaces(() => [tagged("grass", 0, 0), tagged("carpet", 64, 0, 64, 32)], inRoom);

        expect(surfaces.surfaceAt(10, 10)).toBe("grass");
        expect(surfaces.surfaceAt(70, 10)).toBe("carpet");
        expect(surfaces.surfaceAt(120, 10)).toBe("carpet");
    });

    it("prefers a catalog footstepSound over the map layer family (a rug on a tiled floor)", () => {
        const surfaces = new FootstepSurfaces(
            () => [mapLayerFloor("carrelage-gris", 0, 0), tagged("carpet", 0, 0)],
            inRoom,
        );

        expect(surfaces.surfaceAt(10, 10)).toBe("carpet");
    });

    it("falls back to the map layer floor, then wood inside a room, then grass outside", () => {
        const surfaces = new FootstepSurfaces(
            () => [mapLayerFloor("parquet-clair", 0, 0), mapLayerFloor("moquette-mauve", 1, 0)],
            inRoom,
        );

        expect(surfaces.surfaceAt(10, 10)).toBe("wood");
        expect(surfaces.surfaceAt(40, 10)).toBe("carpet");
        expect(surfaces.surfaceAt(250, 10)).toBe("wood");
        expect(surfaces.surfaceAt(500, 10)).toBe("grass");
    });

    it("reads the floors again after a while, as they are edited in the map editor", () => {
        let now = 0;
        let entities = [tagged("stone", 0, 0)];
        const surfaces = new FootstepSurfaces(
            () => entities,
            inRoom,
            () => now,
        );
        expect(surfaces.surfaceAt(10, 10)).toBe("stone");

        entities = [tagged("wood", 0, 0)];
        expect(surfaces.surfaceAt(10, 10)).toBe("stone");
        now = 2000;
        expect(surfaces.surfaceAt(10, 10)).toBe("wood");
    });
});
