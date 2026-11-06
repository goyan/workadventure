import { describe, expect, it } from "vitest";
import type { EntityDataProperty } from "@workadventure/map-editor";
import { makesEntityActivatable } from "../../../../src/front/Phaser/ECS/EntityProperties";

describe("makesEntityActivatable", () => {
    it("ignores an empty description", () => {
        const property: EntityDataProperty = {
            id: "d",
            type: "entityDescriptionProperties",
            description: "",
            searchable: false,
        };
        expect(makesEntityActivatable(property)).toBe(false);
    });

    it("counts a non empty description", () => {
        const property: EntityDataProperty = {
            id: "d",
            type: "entityDescriptionProperties",
            description: "Hi",
            searchable: false,
        };
        expect(makesEntityActivatable(property)).toBe(true);
    });

    it("counts an action property", () => {
        const property: EntityDataProperty = { id: "o", type: "playAudio", audioLink: "https://example.com/a.mp3" };
        expect(makesEntityActivatable(property)).toBe(true);
    });
});
