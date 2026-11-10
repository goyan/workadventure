import { describe, expect, it } from "vitest";
import {
    FLOOR_OBJECT_DEPTH,
    OVERHEAD_OBJECT_DEPTH,
    getLayerDepth,
    stackableDepths,
} from "../../../../src/front/Phaser/ECS/EntityLayerDepth";
import { applyDepthStep } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/ObjectDepthFloor";
import { MAP_LAYER_FLOOR_DEPTH } from "../../../../src/front/Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
import { DEPTH_OVERLAY_INDEX } from "../../../../src/front/Phaser/Game/DepthIndexes";

describe("getLayerDepth", () => {
    it("keeps floor objects over the map floors and under any character, wherever they are", () => {
        // A character's depth is the y of its feet: at least 16 on a map.
        for (const footY of [0, 500, 50_000]) {
            const depth = getLayerDepth("floor", footY);
            expect(depth).toBeGreaterThan(MAP_LAYER_FLOOR_DEPTH);
            expect(depth).toBeLessThan(16);
        }
    });

    it("keeps overhead objects over any character and under the overlay layers", () => {
        for (const footY of [0, 500, 50_000]) {
            const depth = getLayerDepth("overhead", footY);
            expect(depth).toBeGreaterThan(100_000);
            expect(depth).toBeLessThan(DEPTH_OVERLAY_INDEX);
        }
    });

    it("still orders the objects of a level by their foot", () => {
        expect(getLayerDepth("floor", 200)).toBeGreaterThan(getLayerDepth("floor", 100));
        expect(getLayerDepth("floor", 0)).toBe(FLOOR_OBJECT_DEPTH);
        expect(getLayerDepth("overhead", 0)).toBe(OVERHEAD_OBJECT_DEPTH);
    });
});

describe("stackableDepths", () => {
    // A rink raised by two steps in the editor, in a room: another rug under it, a wall and a desk crossing it.
    const neighbours = [
        { layer: "floor" as const, depth: getLayerDepth("floor", 2500) },
        { layer: undefined, depth: 2600 },
        { layer: "standing" as const, depth: 2650 },
        { layer: "overhead" as const, depth: getLayerDepth("overhead", 2700) },
    ];

    it("stacks a floor object among the floor objects only: raised, it stays under every character", () => {
        const depth = applyDepthStep(getLayerDepth("floor", 2720), 2, stackableDepths("floor", neighbours));
        expect(depth).toBeLessThan(16);
        expect(stackableDepths("floor", neighbours)).toEqual([neighbours[0].depth]);
    });

    it("stacks an overhead object among the overhead objects only", () => {
        expect(stackableDepths("overhead", neighbours)).toEqual([neighbours[3].depth]);
    });

    it("stacks a standing object with everything it overlaps, as before", () => {
        expect(stackableDepths(undefined, neighbours)).toEqual(neighbours.map((n) => n.depth));
        expect(stackableDepths("standing", neighbours)).toEqual(neighbours.map((n) => n.depth));
    });
});
