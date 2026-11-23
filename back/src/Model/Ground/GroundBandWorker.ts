import { receiveMessageOnPort, workerData } from "node:worker_threads";
import { WaterBandsFollower } from "@workadventure/map-editor";
import type { GroundBandNews, GroundBandStart } from "./GroundBands";

/**
 * Entry point of a thread of the bands of the water (GroundBands): it sleeps until a pass of the water is opened,
 * computes the slices of rows it can claim, and sleeps again. It never returns to its loop of events: the news of
 * the grids are read from their port each time it wakes.
 */
const { board, news } = workerData as GroundBandStart;
const follower = new WaterBandsFollower(board);

const learn = (): void => {
    for (;;) {
        const received = receiveMessageOnPort(news);
        if (!received) return;
        for (const one of received.message as GroundBandNews[]) {
            // Only the passes written in TypeScript are known here.
            if (one.kernel === "typescript") follower.know(one.grid, one.arrays);
        }
    }
};

while (follower.follow(learn));
process.exit(0);
