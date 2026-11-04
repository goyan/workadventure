import { describe, expect, it } from "vitest";
import { EntityDataProperty, GobeurLevel, WAMFileFormat } from "../src";

describe("gobeurPropertyData", () => {
    it("applies defaults", () => {
        const parsed = EntityDataProperty.parse({ id: "g", type: "gobeurPropertyData" });
        expect(parsed).toEqual({
            id: "g",
            type: "gobeurPropertyData",
            players: [],
            prisonAreaId: "",
            level: "beginner",
            durationSeconds: 180,
        });
    });

    it("rejects an unknown level", () => {
        expect(EntityDataProperty.safeParse({ id: "g", type: "gobeurPropertyData", level: "insane" }).success).toBe(
            false,
        );
    });

    it("rejects out-of-range or non-integer durations", () => {
        for (const durationSeconds of [5, 3601, 60.5]) {
            expect(EntityDataProperty.safeParse({ id: "g", type: "gobeurPropertyData", durationSeconds }).success).toBe(
                false,
            );
        }
        expect(GobeurLevel.options).toEqual(["beginner", "intermediate", "hard"]);
    });

    it("is valid inside a WAM file", () => {
        const wam = {
            version: "1.0.0",
            mapUrl: "map.tmj",
            entities: {
                e1: {
                    x: 0,
                    y: 0,
                    prefabRef: { collectionName: "c", id: "p" },
                    properties: [
                        {
                            id: "g",
                            type: "gobeurPropertyData",
                            players: [{ uuid: "u1", name: "Bob" }],
                            prisonAreaId: "a1",
                            fallbackSafeAreaId: "a2",
                            level: "hard",
                            durationSeconds: 60,
                        },
                    ],
                },
            },
            areas: [],
            entityCollections: [],
        };
        expect(WAMFileFormat.safeParse(wam).success).toBe(true);
    });
});
