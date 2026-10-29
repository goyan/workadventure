import { describe, expect, it } from "vitest";
import {
    mergeEntityCollectionUrls,
    takeUnseenEntities,
} from "../../../../src/front/Phaser/Game/MapEditor/EntityCollectionUrls";

describe("mergeEntityCollectionUrls", () => {
    it("puts WAM urls first, then room urls, keeping order", () => {
        expect(mergeEntityCollectionUrls(["w1", "w2"], ["r1", "r2"])).toEqual(["w1", "w2", "r1", "r2"]);
    });

    it("removes duplicates inside each list and between lists", () => {
        expect(mergeEntityCollectionUrls(["a", "b", "a"], ["b", "c", "c", "a"])).toEqual(["a", "b", "c"]);
    });

    it.each([undefined, null, []])("returns the WAM urls when room urls are %j", (roomUrls) => {
        expect(mergeEntityCollectionUrls(["a", "b"], roomUrls)).toEqual(["a", "b"]);
    });

    it("returns the room urls when the WAM has none", () => {
        expect(mergeEntityCollectionUrls([], ["r1"])).toEqual(["r1"]);
    });
});

describe("takeUnseenEntities", () => {
    it("keeps the first entity of a given id across calls", () => {
        const seen = new Set<string>();
        const first = takeUnseenEntities(
            [
                { id: "a", from: "wam" },
                { id: "a", from: "wam-dup" },
            ],
            seen,
        );
        const second = takeUnseenEntities(
            [
                { id: "a", from: "room" },
                { id: "b", from: "room" },
            ],
            seen,
        );
        expect(first).toEqual([{ id: "a", from: "wam" }]);
        expect(second).toEqual([{ id: "b", from: "room" }]);
    });
});
