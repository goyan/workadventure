import { BLOCK_PX, BlockPainter, GRID_HEIGHT, GRID_WIDTH } from "./Pixel/BlockPainter";
import type { BlockJob } from "./Pixel/BlockPainter";

/**
 * The worker that paints the blocks of the terrain, off the thread of the game: it is given what a block is painted
 * from (BlockJob) and answers its pixels. Loaded by BlockPaintWorkers (`?worker&inline`); it must load nothing heavy
 * (WorkerImports.test).
 */

/** A block to paint; `recycle`: a buffer handed back by the game, to paint into instead of allocating one. */
export interface PaintRequest {
    job: BlockJob;
    recycle?: ArrayBuffer;
}

/** The pixels of a block (RGBA, `size` × `size`, at the start of `pixels`), or why it could not be painted. */
export type PaintResponse = { id: number; pixels: ArrayBuffer; size: number } | { id: number; error: string };

/** What the worker answers to a request, and the buffers it hands over with it (not copied). */
export function answer(
    painter: BlockPainter,
    request: PaintRequest,
): { response: PaintResponse; transfer: ArrayBuffer[] } {
    const { job } = request;
    try {
        const cells = GRID_WIDTH * GRID_HEIGHT;
        if (
            job.heights.length !== cells ||
            job.covers.length !== cells ||
            (job.waters && job.waters.length !== cells)
        ) {
            throw new Error(`a block is painted from ${cells} cells`);
        }
        const pixels = painter.paint(job, request.recycle).buffer as ArrayBuffer;
        return { response: { id: job.id, pixels, size: BLOCK_PX / job.texel }, transfer: [pixels] };
    } catch (error) {
        return {
            response: { id: job.id, error: error instanceof Error ? error.message : String(error) },
            transfer: [],
        };
    }
}

// Typed minimally to avoid pulling in the "webworker" lib (which conflicts with the DOM lib).
interface WorkerScope {
    postMessage(message: PaintResponse, transfer: ArrayBuffer[]): void;
    onmessage: ((event: { data: PaintRequest }) => void) | null;
}

// Only in a worker: this file is also imported by the tests, and by the game for its types.
if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined") {
    const scope = globalThis as unknown as WorkerScope;
    const painter = new BlockPainter();
    scope.onmessage = (event) => {
        const { response, transfer } = answer(painter, event.data);
        scope.postMessage(response, transfer);
    };
}
