import { LocalTerrainSimulation } from "./LocalTerrainSimulation";
import type { LocalTerrainCommand, LocalTerrainTold } from "./LocalTerrainSimulation";

/**
 * Worker entry point of the local ground of a player (LocalTerrainSimulation): its water steps ten times a second off
 * the thread that draws the game. Loaded with `?worker&inline` (as the Matrix worker), so that it is a same-origin
 * blob in the dev setup too. Stopped by the page terminating it.
 */

// The dedicated worker global scope, typed minimally to avoid pulling in the "webworker" lib (which conflicts with the
// project's DOM lib).
interface WorkerScope {
    postMessage(message: LocalTerrainTold): void;
    onmessage: ((event: MessageEvent<LocalTerrainCommand>) => void) | null;
}
const workerScope = self as unknown as WorkerScope;

let simulation: LocalTerrainSimulation | undefined;

workerScope.onmessage = (event: MessageEvent<LocalTerrainCommand>): void => {
    const command = event.data;
    if (command.kind === "start") {
        simulation?.stop();
        simulation = new LocalTerrainSimulation(command.start, (told) => workerScope.postMessage(told));
        simulation.start();
        return;
    }
    if (!simulation) return;
    if (command.kind === "wam") simulation.setWam(command.wam);
    else if (command.kind === "place") simulation.setPlace(command.place, command.slots);
    else simulation.setWalkers(command.walkers);
};
