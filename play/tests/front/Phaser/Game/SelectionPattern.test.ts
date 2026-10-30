import { describe, expect, it } from "vitest";
import { MapPatternPayload } from "../../../../src/common/MapPattern";
import {
    patternPayloadToPlacement,
    selectionToPatternPayload,
} from "../../../../src/front/Phaser/Game/MapEditor/SelectionPattern";
import type { PatternSourceItem } from "../../../../src/front/Phaser/Game/MapEditor/SelectionPattern";

const chair: PatternSourceItem = {
    kind: "entity",
    data: { x: 320, y: 224, prefabRef: { collectionName: "Objects", id: "chair" }, properties: [] },
    dimensions: { width: 32, height: 64 },
    collisionGrid: [[1], [0]],
};

const desk: PatternSourceItem = {
    kind: "entity",
    data: { x: 352, y: 256, prefabRef: { collectionName: "Furniture", id: "desk" }, properties: [] },
    dimensions: { width: 96, height: 32 },
};

const meetingArea: PatternSourceItem = {
    kind: "area",
    data: { id: "area-1", x: 288, y: 192, width: 160, height: 128, name: "Meeting", visible: true, properties: [] },
};

const allKnown = { isPrefabKnown: () => true };
const grid = { width: 32, height: 32 };

describe("selectionToPatternPayload", () => {
    it("should store positions relative to the top-left corner of the selected objects", () => {
        const payload = selectionToPatternPayload([chair, desk], grid);

        // union: x 320 -> 448, y 224 -> 288
        expect(payload.bounds).toEqual({ width: 128, height: 64 });
        expect(payload.items.map((item) => [item.kind, item.data.x, item.data.y])).toEqual([
            ["entity", 0, 0],
            ["entity", 32, 32],
        ]);
    });

    it("should drop the areas of the selection, and ignore them to compute the bounds", () => {
        const payload = selectionToPatternPayload([chair, desk, meetingArea], grid);

        expect(payload.items.every((item) => item.kind === "entity")).toBe(true);
        expect(payload.items).toHaveLength(2);
        expect(payload.bounds).toEqual({ width: 128, height: 64 });
    });

    it("should refuse a selection without any object", () => {
        expect(() => selectionToPatternPayload([meetingArea], grid)).toThrow();
        expect(() => selectionToPatternPayload([], grid)).toThrow();
    });

    it("should keep dimensions and collision grid of entities", () => {
        const payload = selectionToPatternPayload([chair], grid);

        expect(payload.items[0]).toMatchObject({ dimensions: { width: 32, height: 64 }, collisionGrid: [[1], [0]] });
    });

    it("should keep the offset of the selection on the tile grid, so a pasted pattern stays aligned like its source", () => {
        // Thin walls are centered on a grid line: their top-left corner is 6 px before it, the floor tiles sit on the grid.
        const wall: PatternSourceItem = {
            kind: "entity",
            data: { x: 26, y: 58, prefabRef: { collectionName: "Carte Murs", id: "mur-vertical" }, properties: [] },
            dimensions: { width: 12, height: 20 },
        };
        const floor: PatternSourceItem = {
            kind: "entity",
            data: { x: 32, y: 64, prefabRef: { collectionName: "Carte Sols", id: "sol" }, properties: [] },
            dimensions: { width: 32, height: 32 },
        };

        const payload = selectionToPatternPayload([wall, floor], grid);
        const placement = patternPayloadToPlacement(payload, allKnown);

        // Pasting moves the pattern by whole tiles: the offset of its top-left corner must survive.
        expect(placement.bounds.x % grid.width).toBe(26);
        expect(placement.bounds.y % grid.height).toBe(26);
        const floorBounds = placement.items[1].bounds;
        expect(floorBounds.x % grid.width).toBe(0);
        expect(floorBounds.y % grid.height).toBe(0);
        expect(MapPatternPayload.safeParse(payload).success).toBe(true);
    });

    it("should produce a payload accepted by the common schema, and not mutate the selection", () => {
        const before = structuredClone(chair);
        const payload = selectionToPatternPayload([chair, desk], grid);

        expect(MapPatternPayload.safeParse(payload).success).toBe(true);
        expect(chair).toEqual(before);
    });
});

describe("patternPayloadToPlacement", () => {
    const payload = selectionToPatternPayload([chair, desk], grid);
    // A pattern stored before areas were dropped: the schema still reads it.
    const legacyPayload: MapPatternPayload = {
        ...payload,
        items: [...payload.items, { kind: "area", data: { ...meetingArea.data, id: "", x: 0, y: 0 } }],
    };

    it("should rebuild items at the origin with their relative bounds", () => {
        const placement = patternPayloadToPlacement(payload, allKnown);

        expect(placement.ignoredCount).toBe(0);
        expect(placement.bounds).toEqual({ x: 0, y: 0, width: 128, height: 64 });
        expect(placement.items.map((item) => item.bounds)).toEqual([
            { x: 0, y: 0, width: 32, height: 64 },
            { x: 32, y: 32, width: 96, height: 32 },
        ]);
        expect(placement.items.every((item) => item.id === "")).toBe(true);
    });

    it("should ignore, and count, entities whose prefab is not loaded in the map", () => {
        const placement = patternPayloadToPlacement(payload, {
            isPrefabKnown: (collectionName, prefabId) => !(collectionName === "Furniture" && prefabId === "desk"),
        });

        expect(placement.ignoredCount).toBe(1);
        expect(placement.items.map((item) => item.kind)).toEqual(["entity"]);
    });

    it("should skip the areas of an old pattern without counting them as ignored", () => {
        const placement = patternPayloadToPlacement(legacyPayload, allKnown);

        expect(placement.items.map((item) => item.kind)).toEqual(["entity", "entity"]);
        expect(placement.ignoredCount).toBe(0);
        expect(placement.bounds).toEqual({ x: 0, y: 0, width: 128, height: 64 });
    });

    it("should return nothing to paste when every object is ignored", () => {
        const placement = patternPayloadToPlacement(legacyPayload, { isPrefabKnown: () => false });

        expect(placement.items).toEqual([]);
        expect(placement.ignoredCount).toBe(2);
    });
});
