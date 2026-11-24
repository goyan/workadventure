import { describe, expect, it } from "vitest";
import { pointOnWorldMap } from "../../../../src/front/Components/WorldMap/WorldMap";

describe("pointOnWorldMap", () => {
    const box = { left: 10, top: 20, width: 480, height: 240 };

    it("reads the longitude from the left edge and the latitude from the top, whatever the size drawn", () => {
        expect(pointOnWorldMap(box, 10 + 240, 20 + 120)).toEqual({ latitude: 0, longitude: 0 });
        expect(pointOnWorldMap(box, 10 + 480, 20 + 40)).toEqual({ latitude: 60, longitude: 180 });
    });

    it("keeps a point off the poles and within the map", () => {
        expect(pointOnWorldMap(box, 0, 0)).toEqual({ latitude: 89, longitude: -180 });
        expect(pointOnWorldMap(box, 10, 20 + 240)).toEqual({ latitude: -89, longitude: -180 });
    });
});
