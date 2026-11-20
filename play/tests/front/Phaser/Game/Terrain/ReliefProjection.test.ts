import { describe, expect, it } from "vitest";
import { cellKey, withHeights } from "@workadventure/map-editor";
import type { TerrainData } from "@workadventure/map-editor";
import {
    DROP_SCALE,
    MAX_DROP,
    dropAt,
    groundPointAt,
} from "../../../../../src/front/Phaser/Game/Terrain/ReliefProjection";

/**
 * A hollow dug 128 px deep (4 tiles), cells 10 to 13 across and 10 to 21 down: from x 160 to 224, y 160 to 352 on the
 * map. Its floor is flat between the centres of its border cells (y 168 to 344).
 */
function hollow(): TerrainData {
    const changes = new Map<string, number>();
    for (let x = 10; x <= 13; x++) for (let y = 10; y <= 21; y++) changes.set(cellKey(x, y), -128);
    return withHeights(undefined, changes);
}

const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);

describe("the relief seen in 3/4", () => {
    it("draws the dug ground lower by half its depth, at most 128 px", () => {
        expect(DROP_SCALE).toBe(0.5);
        expect(MAX_DROP).toBe(128);
        expect(dropAt(hollow(), 192, 100)).toBe(0);
        expect(dropAt(hollow(), 192, 250)).toBe(64);
        expect(dropAt(undefined, 192, 250)).toBe(0);
    });

    it("finds the floor of a hollow under the point of the screen where it is drawn", () => {
        const ground = groundPointAt(hollow(), { x: 192, y: 250 + 64 });
        expect(ground.x).toBe(192);
        near(ground.y, 250);
    });

    it("takes a click on the face of the drop to its foot", () => {
        // The north face runs on the screen from the rim (y 152) to where the floor starts (168 + 64 = 232).
        const ground = groundPointAt(hollow(), { x: 192, y: 190 });
        near(ground.y, 168);
    });

    it("gives the ground of the south rim where it hides the floor", () => {
        // The floor near the south side (drawn down to 344 + 64 = 408) is behind the flat ground south of the hollow.
        const ground = groundPointAt(hollow(), { x: 192, y: 380 });
        near(ground.y, 380);
    });

    it("leaves a point as it is on a map without relief", () => {
        expect(groundPointAt(undefined, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    });
});
