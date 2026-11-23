import type { InertiaMove } from "./WaterKernel";
import { WATER_KERNEL_WASM_BASE64 } from "./WaterKernelWasm.generated";

/**
 * The kernel of the water compiled to WebAssembly (kernel/water_kernel.c): the passes of WaterKernel.ts, to the
 * bit, about twice as fast. It works on the arrays of the grid where they are: they live in its memory, and the
 * rest of the code reads and writes them as any Float32Array, without a copy.
 *
 * A grid has its own memory, sized once for its cells: it never grows, so the arrays cut out of it never come
 * loose. The module is compiled once, at the first grid that asks for it.
 */

/** The bytes a page of WebAssembly memory holds. */
const PAGE_BYTES = 65_536;
/** The Move of water_kernel.c: its size, and where its figures start (after its three sizes and its arrays). */
const MOVE_BYTES = 152;
const MOVE_FIGURES_AT = 72;
/** The arrays of floats and of bytes a grid cuts out of the memory, one cell each (see WaterGrid). */
const FLOAT_ARRAYS = 12;
const BYTE_ARRAYS = 2;

interface KernelExports {
    __heap_base: WebAssembly.Global;
    flux(move: number, rowFrom: number, rowTo: number): void;
    afford(move: number, rowFrom: number, rowTo: number): void;
    scale(move: number, rowFrom: number, rowTo: number): number;
    depths(move: number, rowFrom: number, rowTo: number, rowLost: number, moved: number): void;
    step(move: number, moves: number, lost: number, rowLost: number, moved: number): number;
}

let compiled: WebAssembly.Module | undefined;

function kernelModule(): WebAssembly.Module {
    if (compiled) return compiled;
    const binary = atob(WATER_KERNEL_WASM_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    compiled = new WebAssembly.Module(bytes);
    return compiled;
}

export class WasmWaterKernel {
    /** Why the last kernel asked for could not be made, when it could not. */
    private static failure: string | undefined;

    /** Why the compiled kernel cannot be had here; undefined when it can. */
    public static unavailable(): string | undefined {
        return WasmWaterKernel.create(1, 2, 1) ? undefined : (WasmWaterKernel.failure ?? "it could not be loaded");
    }

    private next: number;
    private readonly move: number;
    private readonly moved: number;
    private readonly view: DataView;
    private readonly movedView: Int32Array;
    private powers: { from: Float32Array; at: number } | undefined;

    private constructor(
        private readonly memory: WebAssembly.Memory,
        private readonly kernel: KernelExports,
        heapBase: number,
    ) {
        // The Move and the place `moved` is written at, then the arrays.
        this.move = align(heapBase, 8);
        this.moved = this.move + MOVE_BYTES;
        this.next = this.moved + 8;
        this.view = new DataView(memory.buffer);
        this.movedView = new Int32Array(memory.buffer, this.moved, 1);
    }

    /**
     * A kernel for a grid of `cells` cells in `rows` rows and a table of `powers` figures. Undefined where WebAssembly is not to
     * be had (an old browser, a page that forbids compiling): the grid then computes in TypeScript, the same water.
     */
    public static create(cells: number, powers: number, rows: number): WasmWaterKernel | undefined {
        if (cells <= 0) return undefined;
        if (typeof WebAssembly === "undefined") {
            WasmWaterKernel.failure = "WebAssembly is not available here";
            return undefined;
        }
        try {
            const module = kernelModule();
            // What the module asks for at least (its stack), then the Move, the table of powers and the arrays.
            const reserved = 2 * PAGE_BYTES;
            const bytes =
                reserved + MOVE_BYTES + 16 + 4 * powers + (4 * FLOAT_ARRAYS + BYTE_ARRAYS) * cells + 8 * rows + 64;
            const memory = new WebAssembly.Memory({ initial: Math.ceil(bytes / PAGE_BYTES) });
            const instance = new WebAssembly.Instance(module, { env: { memory } });
            const kernel = instance.exports as unknown as KernelExports;
            const heapBase = Number(kernel.__heap_base.value);
            if (!Number.isFinite(heapBase) || heapBase + MOVE_BYTES + 16 > reserved) {
                WasmWaterKernel.failure = "its memory is not laid out as expected";
                return undefined;
            }
            return new WasmWaterKernel(memory, kernel, heapBase);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            // Said once, not at every grid.
            if (WasmWaterKernel.failure !== reason) {
                console.warn("The compiled kernel of the water could not be loaded: computing in TypeScript", error);
            }
            WasmWaterKernel.failure = reason;
            return undefined;
        }
    }

    /** An array of `length` floats in the memory of the kernel, all zeros. */
    public floats(length: number): Float32Array<ArrayBuffer> {
        const at = align(this.next, 4);
        this.next = at + 4 * length;
        return new Float32Array(this.buffer(), at, length);
    }

    /** An array of `length` doubles in the memory of the kernel, all zeros. */
    public doubles(length: number): Float64Array<ArrayBuffer> {
        const at = align(this.next, 8);
        this.next = at + 8 * length;
        return new Float64Array(this.buffer(), at, length);
    }

    /** An array of `length` bytes in the memory of the kernel, all zeros. */
    public bytes(length: number): Uint8Array<ArrayBuffer> {
        const at = this.next;
        this.next = at + length;
        return new Uint8Array(this.buffer(), at, length);
    }

    /**
     * The `moves` moves of a step over the whole grid (the passes of WaterKernel.ts, in their order). `lost` is the
     * water lost so far; returns it with what these moves lost (the rows of each move, written in `rowLost`, added
     * in their order), and whether any moved the water. The speeds of a move take the place of those of the move
     * before: after an odd number of moves, `speedEast` and `nextSpeedEast` (and the south ones) have traded
     * places, which who calls has to follow.
     */
    public step(
        move: InertiaMove,
        moves: number,
        lost: number,
        rowLost: Float64Array,
    ): { lost: number; moved: boolean } {
        this.write(move);
        this.movedView[0] = 0;
        const total = this.kernel.step(this.move, moves, lost, this.pointer(rowLost), this.moved);
        return { lost: total, moved: this.movedView[0] !== 0 };
    }

    /** The passes one by one, over a range of rows: what several threads will call each on its own rows. */
    public fluxPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
        this.write(move);
        this.kernel.flux(this.move, rowFrom, rowTo);
    }

    public affordPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
        this.write(move);
        this.kernel.afford(this.move, rowFrom, rowTo);
    }

    public scalePass(move: InertiaMove, rowFrom: number, rowTo: number): boolean {
        this.write(move);
        return this.kernel.scale(this.move, rowFrom, rowTo) !== 0;
    }

    public depthsPass(move: InertiaMove, rowFrom: number, rowTo: number, rowLost: Float64Array): boolean {
        this.write(move);
        this.movedView[0] = 0;
        this.kernel.depths(this.move, rowFrom, rowTo, this.pointer(rowLost), this.moved);
        return this.movedView[0] !== 0;
    }

    private buffer(): ArrayBuffer {
        if (this.next > this.memory.buffer.byteLength) throw new Error("The memory of the kernel of the water is full");
        return this.memory.buffer;
    }

    /** Where an array of the grid lies in the memory of the kernel. */
    private pointer(array: Float32Array | Float64Array | Uint8Array): number {
        if (array.buffer !== this.memory.buffer)
            throw new Error("An array of the water is not in the memory of its kernel");
        return array.byteOffset;
    }

    /** The table of powers, copied into the memory the first time it is seen. */
    private powersPointer(powers: Float32Array): number {
        if (this.powers?.from !== powers) {
            const copy = this.floats(powers.length);
            copy.set(powers);
            this.powers = { from: powers, at: copy.byteOffset };
        }
        return this.powers.at;
    }

    /** Lays the Move out as water_kernel.c reads it. */
    private write(move: InertiaMove): void {
        const view = this.view;
        let at = this.move;
        const int = (value: number): void => {
            view.setInt32(at, value, true);
            at += 4;
        };
        int(move.width);
        int(move.height);
        int(move.powers.length - 1);
        int(this.pointer(move.depth));
        int(this.pointer(move.ground));
        int(this.pointer(move.spill));
        int(this.pointer(move.closed));
        int(this.pointer(move.hollow));
        int(this.pointer(move.rough));
        int(this.powersPointer(move.powers));
        int(this.pointer(move.east));
        int(this.pointer(move.south));
        int(this.pointer(move.afford));
        int(this.pointer(move.speedEast));
        int(this.pointer(move.speedSouth));
        int(this.pointer(move.nextSpeedEast));
        int(this.pointer(move.nextSpeedSouth));
        at = this.move + MOVE_FIGURES_AT;
        for (const figure of [
            move.dt,
            move.swiftest,
            move.pull,
            move.pulled,
            move.edgeShare,
            move.top,
            move.roughness,
            move.damping,
            move.breaking,
            move.carried,
        ]) {
            view.setFloat64(at, figure, true);
            at += 8;
        }
    }
}

function align(value: number, to: number): number {
    return Math.ceil(value / to) * to;
}
