import { describe, expect, it } from "vitest";
import {
    countsAsHit,
    fullHearts,
    heartFill,
    hit,
    release,
    thirdsAt,
    type NerfHeartsState,
} from "../../../../../src/front/Phaser/Game/Nerf/NerfHearts";

/** Hits the state `count` times, 10 ms apart, from `start`. */
function hits(state: NerfHeartsState, count: number, start: number): { state: NerfHeartsState; eliminated: boolean } {
    let result = { state, eliminated: false };
    for (let i = 0; i < count; i++) result = hit(result.state, start + i * 10);
    return result;
}

describe("NerfHearts", () => {
    it("starts with five full hearts", () => {
        expect(thirdsAt(fullHearts(), 0)).toBe(15);
    });

    it("loses a third per hit and gets it back four seconds after the last hit", () => {
        const { state } = hit(fullHearts(), 1000);
        expect(thirdsAt(state, 1000)).toBe(14);
        expect(thirdsAt(state, 4999)).toBe(14);
        expect(thirdsAt(state, 5000)).toBe(15);
    });

    it("eliminates on the fifteenth hit", () => {
        expect(hits(fullHearts(), 14, 0).eliminated).toBe(false);
        const { state, eliminated } = hits(fullHearts(), 15, 0);
        expect(eliminated).toBe(true);
        expect(state.jailed).toBe(true);
        expect(thirdsAt(state, 150)).toBe(0);
    });

    it("regains a third per second after the delay, up to five hearts, however long the tab slept", () => {
        const { state } = hits(fullHearts(), 5, 0);
        expect(thirdsAt(state, 40)).toBe(10);
        expect(thirdsAt(state, 40 + 4000)).toBe(11);
        expect(thirdsAt(state, 40 + 6000)).toBe(13);
        expect(thirdsAt(state, 40 + 3_600_000)).toBe(15);
    });

    it("keeps a jailed player at zero, whatever hits them", () => {
        const jailed = hits(fullHearts(), 15, 0).state;
        const again = hit(jailed, 500);
        expect(again.eliminated).toBe(false);
        expect(again.state).toEqual(jailed);
        expect(thirdsAt(jailed, 3_600_000)).toBe(0);
    });

    it("comes back with five hearts out of prison", () => {
        const freed = release();
        expect(thirdsAt(freed, 0)).toBe(15);
        expect(freed.jailed).toBe(false);
    });

    it("fills each heart with its thirds", () => {
        expect([0, 1, 2, 3, 4].map((index) => heartFill(15, index))).toEqual([3, 3, 3, 3, 3]);
        expect(heartFill(14, 4)).toBe(2);
        expect(heartFill(13, 4)).toBe(1);
        expect(heartFill(12, 4)).toBe(0);
        expect(heartFill(12, 3)).toBe(3);
        expect(heartFill(0, 0)).toBe(0);
    });

    it("counts a hit only between two equipped players outside the prison", () => {
        const fair = { targetEquipped: true, targetInPrison: false, shooterEquipped: true, shotFromPrison: false };
        expect(countsAsHit(fair)).toBe(true);
        expect(countsAsHit({ ...fair, targetEquipped: false })).toBe(false);
        expect(countsAsHit({ ...fair, targetInPrison: true })).toBe(false);
        expect(countsAsHit({ ...fair, shooterEquipped: false })).toBe(false);
        expect(countsAsHit({ ...fair, shotFromPrison: true })).toBe(false);
    });
});
