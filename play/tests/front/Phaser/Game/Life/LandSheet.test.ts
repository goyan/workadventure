import { describe, expect, it } from "vitest";
import { landSheetOf } from "../../../../../src/front/Phaser/Game/Life/LandSprites";

describe("landSheetOf", () => {
    const prefabs = [
        { id: "Infogène Animaux:canard:Default:Down", wander: { sheetPath: "canard-sheet.png" } },
        { id: "Infogène Animaux:lion:Default:Down", wander: { sheetPath: "lion-sheet.png" } },
        { id: "Infogène Animaux:tigre:Default:Down", wander: { sheetPath: "tigre-sheet.png" } },
        { id: "Infogène Animaux:antilope:Default:Down", wander: { sheetPath: "antilope-sheet.png" } },
        { id: "Autre:antilope:Default:Down" },
    ];

    it("finds the sheet of each species of the land in the catalogues of the map", () => {
        expect(landSheetOf("lion", prefabs)).toBe("lion-sheet.png");
        expect(landSheetOf("tiger", prefabs)).toBe("tigre-sheet.png");
        expect(landSheetOf("antelope", prefabs)).toBe("antilope-sheet.png");
    });

    it("finds none on a map without the catalogue, nor in an object without a sheet", () => {
        expect(landSheetOf("antelope", [])).toBeUndefined();
        expect(landSheetOf("antelope", [{ id: "Autre:antilope:Default:Down" }])).toBeUndefined();
    });
});
