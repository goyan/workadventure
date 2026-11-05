import { describe, expect, it } from "vitest";
import type { AreaData } from "@workadventure/map-editor";
import {
    areaCentre,
    isInsideArea,
    isSafe,
    personalAreaOf,
} from "../../../../../src/front/Phaser/Game/Gobeur/GobeurSafety";

function makeArea(id: string, x: number, y: number, ownerId?: string): AreaData {
    return {
        id,
        name: id,
        x,
        y,
        width: 100,
        height: 50,
        visible: true,
        properties:
            ownerId === undefined
                ? []
                : [{ id: `${id}-p`, type: "personalAreaPropertyData", ownerId, name: "n", publicName: "n" }],
    } as unknown as AreaData;
}

describe("GobeurSafety", () => {
    const mine = makeArea("mine", 0, 0, "me");
    const other = makeArea("other", 500, 0, "you");
    const fallback = makeArea("fallback", 1000, 0);
    const areas = [mine, other, fallback];

    it("includes the borders", () => {
        expect(isInsideArea(mine, { x: 0, y: 0 })).toBe(true);
        expect(isInsideArea(mine, { x: 100, y: 50 })).toBe(true);
        expect(isInsideArea(mine, { x: 101, y: 50 })).toBe(false);
        expect(isInsideArea(mine, { x: 0, y: -1 })).toBe(false);
    });

    it("finds the personal area of an owner", () => {
        expect(personalAreaOf("me", areas)).toBe(mine);
        expect(personalAreaOf("nobody", areas)).toBeUndefined();
    });

    it("is safe inside own personal area", () => {
        expect(isSafe("me", { x: 10, y: 10 }, areas, undefined)).toBe(true);
    });

    it("is not safe inside another personal area", () => {
        expect(isSafe("me", { x: 510, y: 10 }, areas, undefined)).toBe(false);
    });

    it("uses the fallback area when there is no personal area", () => {
        expect(isSafe("nobody", { x: 1010, y: 10 }, areas, "fallback")).toBe(true);
        expect(isSafe("nobody", { x: 10, y: 10 }, areas, "fallback")).toBe(false);
    });

    it("ignores the fallback area when the player has a personal area", () => {
        expect(isSafe("me", { x: 1010, y: 10 }, areas, "fallback")).toBe(false);
    });

    it("is not safe with an unknown fallback area id", () => {
        expect(isSafe("nobody", { x: 1010, y: 10 }, areas, "unknown")).toBe(false);
        expect(isSafe("nobody", { x: 1010, y: 10 }, areas, undefined)).toBe(false);
    });

    it("computes the centre", () => {
        expect(areaCentre(mine)).toEqual({ x: 50, y: 25 });
    });
});
