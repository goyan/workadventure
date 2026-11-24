import { WaterBandsFollower, WaterBandsLead } from "../../src/Terrain/WaterBands";
import type { WaterBandsNews, WaterPass, WaterPassRunner } from "../../src/Terrain/WaterBands";
import type { InertiaMove } from "../../src/Terrain/WaterKernel";

/**
 * The bands of the water without any thread: who follows works on the thread of who leads, when a pass opens, and
 * takes a number of slices drawn from `seed`, none at times. What several threads would do, in an order the test
 * sets: no clock, no wait.
 */
export function bandsOnOneThread(
    followers: number,
    seed = 1,
): WaterPassRunner & { lead: WaterBandsLead; told: WaterBandsNews[]; slices(): { here: number; others: number } } {
    let state = seed >>> 0 || 1;
    const draw = (): number => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state >>> 16;
    };
    const lead: WaterBandsLead = new WaterBandsLead(
        followers,
        () => {
            throw new Error("Who leads slept: a slice was claimed and not computed");
        },
        1000,
        () => 0,
        () => {
            for (const follower of following) follower.workOnce(undefined, draw() % 4);
        },
    );
    const following = Array.from({ length: followers }, () => new WaterBandsFollower(lead.board));
    const told: WaterBandsNews[] = [];
    return {
        lead,
        told,
        slices: () => lead.computed(),
        begin(key: object, move: InertiaMove, rowLost: Float64Array): void {
            for (const news of lead.begin(key, move, rowLost)) {
                told.push(news);
                for (const follower of following) follower.know(news.grid, news.arrays);
            }
        },
        run: (pass: WaterPass) => lead.run(pass),
        forget(key: object): void {
            lead.forget(key);
        },
    };
}
