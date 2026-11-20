import { describe, expect, it } from "vitest";
import { placeOfPoint } from "../../../../../src/front/Phaser/Game/Night/WorldDaylight";

describe("placeOfPoint", () => {
    it("names a point after the nearest city of the list, however far it is, and keeps its own coordinates", () => {
        const place = placeOfPoint({ latitude: 69, longitude: -79 });
        expect(place.name).not.toMatch(/°/);
        expect(place.latitude).toBe(69);
        expect(place.longitude).toBe(-79);
        expect(place.timezone).toBeDefined();
    });
});
