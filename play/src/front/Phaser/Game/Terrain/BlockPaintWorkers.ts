import blockPaintWorkerUrl from "./BlockPaintWorker?worker&url";
import { BlockPaintPool } from "./BlockPaintPool";
import type { WorkerLike } from "./BlockPaintPool";

/** The most workers that paint the blocks of the terrain. */
const MAX_WORKERS = 2;

/** The script the workers start from, made at the first one: never revoked (some Safari read it after the constructor). */
let starter: string | undefined;

/**
 * Starts a worker that paints blocks. Browsers refuse `new Worker()` on a script of another origin, and the script of
 * the worker is served by the assets domain (in development too): a same-origin blob that imports it starts from any
 * origin (as MediaPipeTasksVisionWorkerTransformer does).
 */
function spawn(): WorkerLike {
    starter ??= URL.createObjectURL(
        new Blob([`import ${JSON.stringify(new URL(blockPaintWorkerUrl, import.meta.url).href)};`], {
            type: "text/javascript",
        }),
    );
    return new Worker(starter, { type: "module", name: "terrain-blocks" }) as unknown as WorkerLike;
}

/**
 * The pool of workers that paint the blocks of the terrain off the thread of the game: two at most, one core left to
 * the game. Undefined where there is no Worker: the game paints its blocks itself.
 */
export function createBlockPaintPool(): BlockPaintPool | undefined {
    if (typeof Worker === "undefined") return undefined;
    const cores = typeof navigator === "undefined" ? 2 : (navigator.hardwareConcurrency ?? 2);
    return new BlockPaintPool(spawn, Math.min(MAX_WORKERS, Math.max(1, cores - 1)));
}
