import { GROUND_BANDS, GROUND_THREADS } from "../../Enum/EnvironmentVariable";
import { GroundThreads } from "./GroundThreads";

/**
 * The threads of this server for the grounds of its rooms: as many as GROUND_THREADS says, none when it says nothing;
 * each shares the steps of its waters between as many bands as GROUND_BANDS says, one when it says nothing.
 */
export const groundThreads = new GroundThreads(GROUND_THREADS, undefined, GROUND_BANDS);
console.info(
    groundThreads.count > 0
        ? `The ground of the rooms (water and meadow) is computed on ${groundThreads.count} thread(s) of its own (GROUND_THREADS)`
        : "The ground of the rooms (water and meadow) is computed on the thread of the rooms (GROUND_THREADS is 0)",
);
if (groundThreads.count > 0) {
    console.info(
        groundThreads.bands > 1
            ? `Each step of the water of a room is shared between ${groundThreads.bands} bands of rows: ${groundThreads.bands - 1} more thread(s) for each thread of the grounds (GROUND_BANDS)`
            : "Each step of the water of a room is computed on one thread (GROUND_BANDS is 1)",
    );
} else if (GROUND_BANDS > 1) {
    console.info(
        `GROUND_BANDS is ${GROUND_BANDS} and has no effect: the bands of the water need a thread of the grounds (GROUND_THREADS is 0)`,
    );
}
