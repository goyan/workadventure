import { describe, expect, it } from "vitest";
import { stopShortOf } from "../../../src/front/Utils/PathStop";

describe("stopShortOf", () => {
    const target = { x: 300, y: 100 };

    it("ends the path one tile before the target, on its last segment", () => {
        const path = [
            { x: 100, y: 100 },
            { x: 300, y: 100 },
        ];
        expect(stopShortOf(path, target, 32)).toEqual([
            { x: 100, y: 100 },
            { x: 268, y: 100 },
        ]);
    });

    it("drops the steps that are already closer than the distance", () => {
        const path = [
            { x: 100, y: 300 },
            { x: 300, y: 300 },
            { x: 300, y: 120 },
            { x: 300, y: 100 },
        ];
        expect(stopShortOf(path, target, 32)).toEqual([
            { x: 100, y: 300 },
            { x: 300, y: 300 },
            { x: 300, y: 132 },
        ]);
    });

    it("does not move when the start is already that close", () => {
        const path = [
            { x: 290, y: 100 },
            { x: 300, y: 100 },
        ];
        expect(stopShortOf(path, target, 32)).toEqual([{ x: 290, y: 100 }]);
    });

    it("keeps a path ending far from the target (target unreachable, nearest spot)", () => {
        const path = [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ];
        expect(stopShortOf(path, target, 32)).toEqual(path);
    });
});
