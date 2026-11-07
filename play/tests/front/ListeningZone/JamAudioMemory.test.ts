import { describe, expect, it } from "vitest";
import { parseJamAudioMemory } from "../../../src/front/ListeningZone/JamAudioMemory";

describe("parseJamAudioMemory", () => {
    it("reads what was kept", () => {
        const raw = JSON.stringify({ listening: "world.jam:a", sharing: { spaceName: "world.jam:b", deviceId: "bh" } });
        expect(parseJamAudioMemory(raw)).toEqual({
            listening: "world.jam:a",
            sharing: { spaceName: "world.jam:b", deviceId: "bh" },
        });
    });

    it("starts empty when nothing was kept", () => {
        expect(parseJamAudioMemory(null)).toEqual({});
    });

    it("starts empty when what was kept is not JSON", () => {
        expect(parseJamAudioMemory("{not json")).toEqual({});
    });

    it("drops what has the wrong shape, keeping the rest", () => {
        const raw = JSON.stringify({ listening: 42, sharing: { spaceName: "world.jam:b" } });
        expect(parseJamAudioMemory(raw)).toEqual({});
        expect(parseJamAudioMemory(JSON.stringify({ listening: "world.jam:a", sharing: "bh" }))).toEqual({
            listening: "world.jam:a",
        });
    });

    it("ignores anything that is not an object", () => {
        expect(parseJamAudioMemory("42")).toEqual({});
        expect(parseJamAudioMemory("null")).toEqual({});
    });
});
