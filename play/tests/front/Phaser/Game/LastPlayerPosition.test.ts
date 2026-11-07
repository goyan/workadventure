import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLastPlayerPosition, saveLastPlayerPosition } from "../../../../src/front/Phaser/Game/LastPlayerPosition";

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("last player position", () => {
    it("restores the position after a reload for the same room and identity", () => {
        saveLastPlayerPosition("room", "alice", { x: 400, y: 336 });
        expect(readLastPlayerPosition("room", "alice")).toEqual({ x: 400, y: 336 });
        expect(readLastPlayerPosition("other-room", "alice")).toBeUndefined();
        expect(readLastPlayerPosition("room", "bob")).toBeUndefined();
    });

    it("ignores corrupt or invalid coordinates", () => {
        localStorage.setItem("lastPlayerPosition", "{");
        expect(readLastPlayerPosition("room", "alice")).toBeUndefined();
        saveLastPlayerPosition("room", "alice", { x: -1, y: 20 });
        expect(readLastPlayerPosition("room", "alice")).toBeUndefined();
        saveLastPlayerPosition("room", "alice", { x: Infinity, y: 20 });
        expect(readLastPlayerPosition("room", "alice")).toBeUndefined();
    });

    it("does not mix anonymous sessions", () => {
        saveLastPlayerPosition("room", undefined, { x: 20, y: 30 });
        expect(readLastPlayerPosition("room", undefined)).toBeUndefined();
    });

    it("still works when browser storage is unavailable", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("Denied");
        });
        expect(() => saveLastPlayerPosition("room", "alice", { x: 20, y: 30 })).not.toThrow();
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("Denied");
        });
        expect(readLastPlayerPosition("room", "alice")).toBeUndefined();
    });
});
