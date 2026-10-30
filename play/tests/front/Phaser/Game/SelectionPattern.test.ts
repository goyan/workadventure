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

const allKnown = { isPrefabKnown: () => true, canEditAreas: true };

describe("selectionToPatternPayload", () => {
    it("should store positions relative to the top-left corner of the selection", () => {
        const payload = selectionToPatternPayload([chair, desk, meetingArea]);

        // union: x 288 -> 448, y 192 -> 320
        expect(payload.bounds).toEqual({ width: 160, height: 128 });
        expect(payload.items.map((item) => [item.kind, item.data.x, item.data.y])).toEqual([
            ["entity", 32, 32],
            ["entity", 64, 64],
            ["area", 0, 0],
        ]);
    });

    it("should not store the original ids", () => {
        const payload = selectionToPatternPayload([meetingArea]);

        const area = payload.items[0];
        expect(area.kind === "area" && area.data.id).toBe("");
    });

    it("should keep dimensions and collision grid of entities", () => {
        const payload = selectionToPatternPayload([chair]);

        expect(payload.items[0]).toMatchObject({ dimensions: { width: 32, height: 64 }, collisionGrid: [[1], [0]] });
    });

    it("should produce a payload accepted by the common schema, and not mutate the selection", () => {
        const before = structuredClone(chair);
        const payload = selectionToPatternPayload([chair, desk, meetingArea]);

        expect(MapPatternPayload.safeParse(payload).success).toBe(true);
        expect(chair).toEqual(before);
    });

    it("should refuse an empty selection", () => {
        expect(() => selectionToPatternPayload([])).toThrow();
    });
});

describe("patternPayloadToPlacement", () => {
    const payload = selectionToPatternPayload([chair, desk, meetingArea]);

    it("should rebuild items at the origin with their relative bounds", () => {
        const placement = patternPayloadToPlacement(payload, allKnown);

        expect(placement.ignoredCount).toBe(0);
        expect(placement.bounds).toEqual({ x: 0, y: 0, width: 160, height: 128 });
        expect(placement.items.map((item) => item.bounds)).toEqual([
            { x: 32, y: 32, width: 32, height: 64 },
            { x: 64, y: 64, width: 96, height: 32 },
            { x: 0, y: 0, width: 160, height: 128 },
        ]);
        expect(placement.items.every((item) => item.id === "")).toBe(true);
    });

    it("should ignore, and count, entities whose prefab is not loaded in the map", () => {
        const placement = patternPayloadToPlacement(payload, {
            isPrefabKnown: (collectionName, prefabId) => !(collectionName === "Furniture" && prefabId === "desk"),
            canEditAreas: true,
        });

        expect(placement.ignoredCount).toBe(1);
        expect(placement.items.map((item) => item.kind)).toEqual(["entity", "area"]);
    });

    it("should ignore, and count, areas when the user cannot edit areas", () => {
        const placement = patternPayloadToPlacement(payload, { isPrefabKnown: () => true, canEditAreas: false });

        expect(placement.ignoredCount).toBe(1);
        expect(placement.items.map((item) => item.kind)).toEqual(["entity", "entity"]);
    });

    it("should return nothing to paste when every item is ignored", () => {
        const placement = patternPayloadToPlacement(payload, { isPrefabKnown: () => false, canEditAreas: false });

        expect(placement.items).toEqual([]);
        expect(placement.ignoredCount).toBe(3);
    });
});
