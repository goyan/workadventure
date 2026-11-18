import { describe, expect, it } from "vitest";
import { MapLayerModel } from "../../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerModel";
import {
    GLASS_KEPT_LIGHT,
    interiorOpenings,
    lightThroughPanes,
    windowLightPatch,
    windowOpenings,
} from "../../../../../src/front/Phaser/Game/SkyShadows/SkyWindowLight";
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

describe("the light of the sky through two windows", () => {
    // The outdoors south of the wall of the line 8, a corridor (room 0) north of it, then the wall of the line 4, then
    // a room (room 1). Tall glass on the outside, a window in the inner wall, right behind it.
    function house(innerWindowX = 2) {
        const model = new MapLayerModel();
        for (const x of [1, 2, 3, 4, 5, 6]) {
            // Walls 3 tiles high: the glass can be tall.
            model.setWall("h", x, 8, "blanc", 3);
            model.setWall("h", x, 4, "blanc", 3);
        }
        model.setWindow(2, 8, 3);
        model.setWindow(innerWindowX, 4, 2);
        const roomAt = (_x: number, y: number): number | undefined =>
            y < 128 ? 1 : y >= 160 && y < 256 ? 0 : undefined;
        const isOutdoorAt = (_x: number, y: number): boolean => y >= 288;
        return {
            openings: windowOpenings(model, roomAt, isOutdoorAt),
            interior: interiorOpenings(model, roomAt),
        };
    }
    const lowSouthSun = { azimuth: 180, elevation: 20, shadowLength: { min: 0, max: 256 } };

    it("finds the windows between two rooms, with the room on each side", () => {
        const { openings, interior } = house();
        expect(openings).toHaveLength(1);
        expect(interior).toHaveLength(1);
        expect(interior[0]).toMatchObject({ x: 64, width: 32, footY: 160, north: 1, south: 0 });
    });

    it("carries a low sun on into the room behind the inner window, a little weaker for the glass", () => {
        const { openings, interior } = house();
        const patches = lightThroughPanes(openings, interior, lowSouthSun);

        expect(patches.map((patch) => [patch.room, patch.strength])).toEqual([
            [0, 1],
            [1, GLASS_KEPT_LIGHT],
        ]);
        // On the floor of the room, behind the inner window, where a ray through both panes lands.
        expect(inside(patches[1].polygon, 80, 90)).toBe(true);
        // Never wider than the light that came in through the first pane.
        expect(inside(patches[0].polygon, 80, 90)).toBe(true);
        expect(inside(patches[1].polygon, 40, 90)).toBe(false);
    });

    it("stops a high sun in the corridor: its light falls short of the inner window", () => {
        const { openings, interior } = house();
        const patches = lightThroughPanes(openings, interior, { ...lowSouthSun, elevation: 60 });

        expect(patches.map((patch) => patch.room)).toEqual([0]);
    });

    it("lets nothing through an inner window the light of the first pane does not reach", () => {
        const { openings, interior } = house(6);
        const patches = lightThroughPanes(openings, interior, lowSouthSun);

        expect(patches.map((patch) => patch.room)).toEqual([0]);
    });

    it("lets nothing in at all from a sun on the other side of the house", () => {
        const { openings, interior } = house();
        expect(lightThroughPanes(openings, interior, { ...lowSouthSun, azimuth: 0 })).toEqual([]);
    });

    it("goes through as many panes as it is allowed, no more", () => {
        const { openings, interior } = house();
        expect(lightThroughPanes(openings, interior, lowSouthSun, 1).map((patch) => patch.room)).toEqual([0]);
    });
});

describe("the light of the sky relayed by an inner window it reaches", () => {
    // As on the map: glass one tile high on the outside (line 8) and in the inner wall (line 5), a corridor two tiles
    // deep between them (room 0), a room behind (room 1).
    function corridor() {
        const model = new MapLayerModel();
        for (const x of [1, 2, 3, 4, 5, 6]) {
            model.setWall("h", x, 8, "blanc");
            model.setWall("h", x, 5, "blanc");
        }
        model.setWindow(2, 8);
        model.setWindow(3, 8);
        model.setWindow(2, 5);
        model.setWindow(3, 5);
        const roomAt = (_x: number, y: number): number | undefined =>
            y < 160 ? 1 : y >= 192 && y < 256 ? 0 : undefined;
        const isOutdoorAt = (_x: number, y: number): boolean => y >= 288;
        return {
            openings: windowOpenings(model, roomAt, isOutdoorAt),
            interior: interiorOpenings(model, roomAt),
        };
    }
    const morningSun = { azimuth: 180, elevation: 20 };

    it("goes on into the room when the light crosses the corridor up to the inner window", () => {
        const { openings, interior } = corridor();
        const patches = lightThroughPanes(openings, interior, morningSun);
        const relayed = patches.filter((patch) => patch.room === 1);

        expect(relayed.length).toBeGreaterThan(0);
        expect(relayed.every((patch) => patch.strength === GLASS_KEPT_LIGHT)).toBe(true);
        // On the floor of the room, a little behind the inner window.
        expect(relayed.some((patch) => inside(patch.polygon, 80, 130))).toBe(true);
    });

    it("relays the light only over the width of glass the light reaches, when the sun comes from the side", () => {
        const { openings, interior } = corridor();
        // From the south-east: the light drifts west on its way across the corridor.
        const relayed = lightThroughPanes(openings, interior, { azimuth: 150, elevation: 16 }).filter(
            (patch) => patch.room === 1,
        );
        const straight = lightThroughPanes(openings, interior, { azimuth: 180, elevation: 16 }).filter(
            (patch) => patch.room === 1,
        );
        const width = (list: typeof relayed): number =>
            list.reduce((sum, patch) => {
                const xs = patch.polygon.slice(0, 2).map((point) => point.x);
                return sum + Math.abs(xs[1] - xs[0]);
            }, 0);

        expect(relayed.length).toBeGreaterThan(0);
        expect(width(relayed)).toBeLessThan(width(straight));
    });

    it("does not go on when the light falls short of the inner wall", () => {
        const { openings, interior } = corridor();
        const patches = lightThroughPanes(openings, interior, { azimuth: 180, elevation: 50 });

        expect(patches.some((patch) => patch.room === 1)).toBe(false);
    });
});
