import { setWaterKernel, waterKernelInUse } from "@workadventure/map-editor";
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
        // The kernel of the water of this worker: the TypeScript one unless the page asks for the compiled one.
        setWaterKernel(command.start.kernel ?? "typescript");
        if (command.start.kernel === "wasm") {
            const inUse = waterKernelInUse();
            console.info(
                inUse.kernel === "wasm"
                    ? "The local water is computed by the WebAssembly kernel (localStorage waterKernel)"
                    : `The local water is computed by the TypeScript kernel: the WebAssembly one could not be loaded (${inUse.fallback ?? "unknown"})`,
            );
        }
        simulation = new LocalTerrainSimulation(command.start, (told) => workerScope.postMessage(told));
        simulation.start();
        return;
    }
    if (!simulation) return;
    switch (command.kind) {
        case "wam":
            simulation.setWam(command.wam);
            return;
        case "place":
            simulation.setPlace(command.place, command.slots);
            return;
        case "fast":
            simulation.setFast(command.fast);
            return;
        case "walkers":
            simulation.setWalkers(command.walkers);
            return;
        case "catastrophes":
            simulation.setCatastrophes({
                downpours: command.downpours,
                drains: command.drains,
                balls: command.balls,
                ...(command.colds ? { colds: command.colds } : {}),
                ...(command.tsunami ? { tsunami: command.tsunami } : {}),
            });
            return;
        case "calm":
            simulation.calm();
            return;
        case "strike":
            simulation.strike(command.x, command.y, command.radiusTiles);
            return;
        case "shatter":
            simulation.shatter(command.x, command.y, command.radiusTiles);
            return;
        case "ignite":
            simulation.ignite(command.x, command.y, command.radiusTiles);
            return;
        case "burn":
            simulation.burn(command.x, command.y, command.radiusTiles, command.id);
            return;
        case "soak":
            simulation.soak(command.downpour);
            return;
    }
};
