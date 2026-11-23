import { GROUND_THREADS } from "../../Enum/EnvironmentVariable";
import { GroundThreads } from "./GroundThreads";

/** The threads of this server for the grounds of its rooms: as many as GROUND_THREADS says, none when it says nothing. */
export const groundThreads = new GroundThreads(GROUND_THREADS);
console.info(
    groundThreads.count > 0
        ? `The ground of the rooms (water and meadow) is computed on ${groundThreads.count} thread(s) of its own (GROUND_THREADS)`
        : "The ground of the rooms (water and meadow) is computed on the thread of the rooms (GROUND_THREADS is 0)",
);
