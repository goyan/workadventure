import { describe, expect, it } from "vitest";
import { playsBasic, zombieAvatarsOf } from "../src/Model/PlayerPerception";

describe("playsBasic", () => {
    it("reads Basique from the public player variable the front sends, serialized as JSON", () => {
        expect(playsBasic(new Map([["_perception", { value: JSON.stringify("basic") }]]))).toBe(true);
        expect(playsBasic(new Map([["_perception", { value: JSON.stringify("place") }]]))).toBe(false);
        expect(playsBasic(new Map([["_perception", { value: JSON.stringify("none") }]]))).toBe(false);
        expect(playsBasic(new Map([["_perception", { value: "not json" }]]))).toBe(false);
        expect(playsBasic(new Map())).toBe(false);
        expect(playsBasic(undefined)).toBe(false);
    });
});

describe("zombieAvatarsOf", () => {
    const user = (id: number, perception?: string, disconnected = false, floorZ = 0) => ({
        id,
        disconnected,
        getPosition: () => ({ x: id * 10, y: id * 20 }),
        getFloorZ: () => floorZ,
        getVariables: () => ({
            getVariables: () => new Map(perception ? [["_perception", { value: JSON.stringify(perception) }]] : []),
        }),
    });

    it("tells the horde of every avatar but those who play in Basique or left", () => {
        expect(zombieAvatarsOf([user(1), user(2, "basic"), user(3, "place"), user(4, undefined, true)])).toEqual([
            { key: 1, x: 10, y: 20 },
            { key: 3, x: 30, y: 60 },
        ]);
    });

    it("tells an avatar on the deck of a bridge at the ground under it, where the horde runs", () => {
        // 20 px up, it is drawn 20 px further north than the ground it stands over.
        expect(zombieAvatarsOf([user(5, undefined, false, 20)])).toEqual([{ key: 5, x: 50, y: 120 }]);
    });
});
