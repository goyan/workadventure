import { describe, expect, it } from "vitest";
import type { EntityPrefab } from "@workadventure/map-editor";
import { iceRectanglesOf, isOnIce } from "../../../../../src/front/Phaser/Game/Ice/IceZones";

const placed = (tags: string[], extra: Partial<EntityPrefab> = {}) => ({
    x: 100,
    y: 50,
    displayWidth: 256,
    displayHeight: 160,
    getPrefab: () => ({ name: "x.png", tags, ...extra }) as unknown as EntityPrefab,
});

describe("IceZones", () => {
    it("an ice rink object is ice over its whole image", () => {
        expect(iceRectanglesOf([placed(["rinks"])], undefined)).toEqual([{ x: 100, y: 50, width: 256, height: 160 }]);
    });

    it("other objects are not ice", () => {
        const water = [{ x: 0, y: 0, width: 10, height: 10 }];
        expect(iceRectanglesOf([placed(["pools"], { water }), placed(["tables"])], undefined)).toEqual([]);
    });

    it("a map category set to skate is ice, a base category turned off is not", () => {
        expect(iceRectanglesOf([placed(["glace"])], { glace: { interaction: "skate", trigger: "key" } })).toHaveLength(
            1,
        );
        expect(iceRectanglesOf([placed(["rinks"])], { rinks: { interaction: "none", trigger: "auto" } })).toEqual([]);
    });

    it("tells whether a point is on the ice", () => {
        const rink = [{ x: 100, y: 50, width: 256, height: 160 }];
        expect(isOnIce(rink, { x: 110, y: 60 })).toBe(true);
        expect(isOnIce(rink, { x: 356, y: 60 })).toBe(false);
        expect(isOnIce(rink, { x: 99, y: 60 })).toBe(false);
    });
});
