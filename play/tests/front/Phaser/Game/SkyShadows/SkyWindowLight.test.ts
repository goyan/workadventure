import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import { windowLightPatch, windowOpenings } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyWindowLight";
import type { Point } from "../../../../../src/front/Phaser/Game/SkyShadows/SkyShadowGeometry";

/** Whether a point is inside a polygon (ray casting). */
function inside(polygon: readonly Point[], x: number, y: number): boolean {
    let result = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
        const a = polygon[index];
        const b = polygon[previous];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
}

/** A wall on the line 3 (drawn on the row 3, its foot at y = 128); room 0 on one side of it, the outdoors on the other. */
function setup(roomSide: "north" | "south"): {
    model: MapLayerModel;
    roomAt: (x: number, y: number) => number | undefined;
    isOutdoorAt: (x: number, y: number) => boolean;
} {
    const model = new MapLayerModel();
    for (const x of [1, 2, 3, 4]) model.setWall("h", x, 3, "blanc");
    const wallTop = 96;
    const wallFoot = 128;
    const inRoom = (y: number): boolean => (roomSide === "north" ? y < wallTop : y >= wallFoot);
    return {
        model,
        roomAt: (_x, y) => (inRoom(y) ? 0 : undefined),
        isOutdoorAt: (_x, y) => !inRoom(y) && (y < wallTop || y >= wallFoot),
    };
}

const southSun = { azimuth: 180, elevation: 30 };
const northSun = { azimuth: 0, elevation: 30 };

describe("windowOpenings", () => {
    it("finds the windows and the glazed doors between the outdoors and a room, not the plain doors", () => {
        const { model, roomAt, isOutdoorAt } = setup("north");
        model.setWindow(2, 3);
        model.setDoor({ orientation: "h", x: 4, y: 3 });
        expect(windowOpenings(model, roomAt, isOutdoorAt)).toHaveLength(1);
        model.setDoorGlazed({ orientation: "h", x: 4, y: 3 }, true);
        const openings = windowOpenings(model, roomAt, isOutdoorAt);
        expect(openings).toHaveLength(2);
        expect(openings[0]).toMatchObject({ x: 64, width: 32, footY: 128, room: 0, inside: "north" });
        // A glazed door: two tiles wide, its glass down to the floor.
        expect(openings[1]).toMatchObject({ x: 96, width: 64, sill: 0, inside: "north" });
    });

    it("leaves out a window between two rooms or with the outdoors on both sides", () => {
        const model = new MapLayerModel();
        model.setWall("h", 2, 3, "blanc");
        model.setWindow(2, 3);
        expect(
            windowOpenings(
                model,
                () => 0,
                () => false,
            ),
        ).toEqual([]);
        expect(
            windowOpenings(
                model,
                () => undefined,
                () => true,
            ),
        ).toEqual([]);
    });
});

describe("windowLightPatch", () => {
    it("lays the light of a sun in the south on the floor of a room north of the window", () => {
        const { model, roomAt, isOutdoorAt } = setup("north");
        model.setWindow(2, 3);
        const [opening] = windowOpenings(model, roomAt, isOutdoorAt);
        const patch = windowLightPatch(opening, southSun);
        expect(patch).toBeDefined();
        if (!patch) return;
        // Between where the rays through the sill and through the top of the glass meet the floor, north of the foot.
        const near = 128 - opening.sill / Math.tan(Math.PI / 6);
        const far = 128 - opening.top / Math.tan(Math.PI / 6);
        expect(inside(patch, 80, (near + far) / 2)).toBe(true);
        expect(inside(patch, 80, 140)).toBe(false);
        expect(inside(patch, 40, (near + far) / 2)).toBe(false);
    });

    it("follows the longest shadow set for the light, not the shortest: the light starts at the pane", () => {
        const { model, roomAt, isOutdoorAt } = setup("north");
        model.setWindow(2, 3);
        const [opening] = windowOpenings(model, roomAt, isOutdoorAt);
        const light = { azimuth: 180, elevation: 10, shadowLength: { min: 64, max: 32 } };
        const patch = windowLightPatch(opening, { ...light, shadowLength: { min: 64, max: 96 } });
        // The ray through the sill meets the floor 8 / tan(10°) = 45 px from the foot, under the minimum of 64.
        expect(patch && inside(patch, 80, 128 - 50)).toBe(true);
        // A maximum of one tile: the patch stops 32 px from the foot.
        const short = windowLightPatch(opening, light);
        expect(short && inside(short, 80, 128 - 40)).toBe(false);
    });

    it("lets no sun in through a window facing away from it", () => {
        const { model, roomAt, isOutdoorAt } = setup("north");
        model.setWindow(2, 3);
        const [opening] = windowOpenings(model, roomAt, isOutdoorAt);
        expect(windowLightPatch(opening, northSun)).toBeUndefined();
        expect(windowLightPatch(opening, { azimuth: 180, elevation: -2 })).toBeUndefined();
    });

    it("lays the light of a sun in the north on the floor of a room south of the window", () => {
        const { model, roomAt, isOutdoorAt } = setup("south");
        model.setWindow(2, 3);
        const [opening] = windowOpenings(model, roomAt, isOutdoorAt);
        expect(opening.inside).toBe("south");
        const patch = windowLightPatch(opening, northSun);
        expect(patch).toBeDefined();
        if (!patch) return;
        expect(inside(patch, 80, 128 + (opening.sill + opening.top) / 2 / Math.tan(Math.PI / 6))).toBe(true);
        expect(windowLightPatch(opening, southSun)).toBeUndefined();
    });
});
