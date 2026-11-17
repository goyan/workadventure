import { describe, expect, it } from "vitest";
import { WAMEntityData } from "../src/types";

const entity = {
    x: 320,
    y: 96,
    prefabRef: { collectionName: "Carte Paliers", id: "Carte Paliers:dalle-parquet-clair:Default:Down" },
};

describe("EntityData.elevation", () => {
    it("is kept when the entity stands on a raised floor", () => {
        expect(WAMEntityData.parse({ ...entity, elevation: 52 }).elevation).toBe(52);
    });

    it("stays absent for an entity of a map saved before the floors: it stands on the ground", () => {
        expect(WAMEntityData.parse(entity).elevation).toBeUndefined();
    });

    it("refuses an altitude under the ground or between two pixels", () => {
        expect(WAMEntityData.safeParse({ ...entity, elevation: -1 }).success).toBe(false);
        expect(WAMEntityData.safeParse({ ...entity, elevation: 51.5 }).success).toBe(false);
    });
});
