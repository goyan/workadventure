import { describe, expect, it } from "vitest";
import { BALL_ICE_AGAIN_MS, BALL_ICE_MOST_DISCS, ballIceDiscs } from "../src/Catastrophe/Ball";

const ball = { x: 100, y: 100, radiusPx: 64 };

describe("the ice a ball breaks (ballIceDiscs)", () => {
    it("breaks the ice under the ball at its first message", () => {
        expect(ballIceDiscs(undefined, ball, 0)).toEqual([{ x: 100, y: 100 }]);
    });

    it("breaks nothing while the ball is of the same size, within half its radius of the last break, and it is recent", () => {
        const last = { ...ball, at: 0 };
        expect(ballIceDiscs(last, { ...ball, x: 120 }, 100)).toEqual([]);
        expect(ballIceDiscs(last, ball, BALL_ICE_AGAIN_MS - 1)).toEqual([]);
    });

    it("breaks the ice again once the frost had time to close it, or when the ball grew", () => {
        const last = { ...ball, at: 0 };
        expect(ballIceDiscs(last, ball, BALL_ICE_AGAIN_MS)).toEqual([{ x: 100, y: 100 }]);
        expect(ballIceDiscs(last, { ...ball, radiusPx: 96 }, 10)).toHaveLength(1);
    });

    it("breaks a disc every radius along the way, the last one under the ball", () => {
        const last = { ...ball, at: 0 };
        expect(ballIceDiscs(last, { ...ball, x: 100 + 3 * 64 }, 50).map((disc) => disc.x)).toEqual([164, 228, 292]);
    });

    it("takes a ball of a tile as a disc a tile apart, and never more discs than BALL_ICE_MOST_DISCS", () => {
        const small = { x: 0, y: 0, radiusPx: 16 };
        expect(ballIceDiscs({ ...small, at: 0 }, { ...small, x: 64 }, 50)).toHaveLength(2);
        expect(ballIceDiscs({ ...small, at: 0 }, { ...small, x: 100_000 }, 50)).toHaveLength(BALL_ICE_MOST_DISCS);
    });

    it("breaks nothing for a ball that is not on the map", () => {
        expect(ballIceDiscs(undefined, { ...ball, x: Number.NaN }, 0)).toEqual([]);
    });
});
