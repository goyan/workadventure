import BlockPaintWorker from "./BlockPaintWorker?worker&inline";
import { BlockPaintPool } from "./BlockPaintPool";
import type { WorkerLike } from "./BlockPaintPool";

/** The most workers that paint the blocks of the terrain. */
const MAX_WORKERS = 2;

/**
 * The pool of workers that paint the blocks of the terrain off the thread of the game: two at most, one core left to
 * the game. Undefined where there is no Worker: the game paints its blocks itself.
 */
export function createBlockPaintPool(): BlockPaintPool | undefined {
    if (typeof Worker === "undefined") return undefined;
    const cores = typeof navigator === "undefined" ? 2 : (navigator.hardwareConcurrency ?? 2);
    return new BlockPaintPool(
        () => new BlockPaintWorker() as unknown as WorkerLike,
        Math.min(MAX_WORKERS, Math.max(1, cores - 1)),
    );
}
