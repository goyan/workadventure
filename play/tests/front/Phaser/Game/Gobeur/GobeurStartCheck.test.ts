import { describe, expect, it } from "vitest";
import type { GobeurPropertyData } from "@workadventure/map-editor";
import {
    GOBEUR_START_DURATION_MARGIN_MS,
    isStartConsistentWithProperty,
} from "../../../../../src/front/Phaser/Game/Gobeur/GobeurStartCheck";
import type { GobeurStartMessage } from "../../../../../src/front/Phaser/Game/Gobeur/GobeurProtocol";

function property(overrides: Partial<GobeurPropertyData> = {}): GobeurPropertyData {
    return {
        id: "p1",
        type: "gobeurPropertyData",
        players: [
            { uuid: "m", name: "M" },
            { uuid: "a", name: "A" },
            { uuid: "b", name: "B" },
        ],
        prisonAreaId: "prison",
        level: "beginner",
        durationSeconds: 60,
        ...overrides,
    };
}

function start(overrides: Partial<GobeurStartMessage> = {}): GobeurStartMessage {
    return {
        kind: "start",
        gameId: "g1",
        entityId: "e1",
        masterUuid: "m",
        startedAt: 1000,
        endsAt: 61_000,
        level: "beginner",
        prisonAreaId: "prison",
        players: ["m", "a"],
        ...overrides,
    };
}

describe("isStartConsistentWithProperty", () => {
    it("accepts a start matching the property", () => {
        expect(isStartConsistentWithProperty(start(), property())).toBe(true);
    });

    it("rejects a start without a property", () => {
        expect(isStartConsistentWithProperty(start(), undefined)).toBe(false);
    });

    it("rejects another prison than the property's", () => {
        expect(isStartConsistentWithProperty(start({ prisonAreaId: "vault" }), property())).toBe(false);
    });

    it("rejects a player who is not in the property", () => {
        expect(isStartConsistentWithProperty(start({ players: ["m", "zzz"] }), property())).toBe(false);
    });

    it("accepts an empty players list", () => {
        expect(isStartConsistentWithProperty(start({ players: [] }), property())).toBe(true);
    });

    it("accepts a duration up to the property's plus the margin", () => {
        const endsAt = 1000 + 60_000 + GOBEUR_START_DURATION_MARGIN_MS;
        expect(isStartConsistentWithProperty(start({ endsAt }), property())).toBe(true);
    });

    it("rejects a duration longer than the property's plus the margin", () => {
        const endsAt = 1000 + 60_000 + GOBEUR_START_DURATION_MARGIN_MS + 1;
        expect(isStartConsistentWithProperty(start({ endsAt }), property())).toBe(false);
    });
});
