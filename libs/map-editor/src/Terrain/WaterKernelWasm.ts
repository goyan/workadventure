import { ordinaryWaterArrays, sharedWaterArrays } from "./WaterArrays";
import type { WaterArrays } from "./WaterArrays";
import type { CompiledPasses, InertiaMove } from "./WaterKernel";
import { WATER_KERNEL_SHARED_WASM_BASE64, WATER_KERNEL_WASM_BASE64 } from "./WaterKernelWasm.generated";

/**
 * The kernel of the water compiled to WebAssembly (kernel/water_kernel.c): the passes of WaterKernel.ts, to the
 * bit, about 1.6 times as fast. It is also where a grid keeps its arrays (WaterArrays): they live in its memory,
 * and the rest of the code reads and writes them as any Float32Array, without a copy.
 *
 * A grid has its own memory, sized once for its cells at its first array: it never grows, so the arrays cut out
 * of it never come loose. In a memory threads share (`shared`), the threads that follow the passes of a grid
 * (WaterBands) join it: each has its own instance of the module on the same memory. The module is compiled once a
 * thread, at the first grid that asks for it.
 *
 * Where WebAssembly cannot be had (an old browser, a page that forbids compiling), the arrays are ordinary ones and
 * the grid computes in TypeScript: the same water.
 */

/** The bytes a page of WebAssembly memory holds. */
const PAGE_BYTES = 65_536;
/** The Move of water_kernel.c: its size, and where its figures start (after its three sizes and its arrays). */
const MOVE_BYTES = 160;
const MOVE_FIGURES_AT = 72;
/**
 * What each thread keeps for itself in the memory: a Move, the place `moved` is written at, and a stack. The
 * module has one pointer of stack an instance, which starts at the same place for all: each thread sets its own on
 * its slot, so that no two threads ever share a stack, whatever the compiler puts there.
 */
const SLOT_HEAD_BYTES = 176;
const STACK_BYTES = 4096;
const SLOT_BYTES = SLOT_HEAD_BYTES + STACK_BYTES;
/** The most threads that work in one memory: who leads and who follows. */
const MOST_SLOTS = 64;
/** The pages kept at the start of the memory for the module and for the slots of the threads. */
const RESERVED_PAGES = 6;
/** The arrays of floats and of bytes a grid cuts out of the memory, one cell each (see WaterGrid). */
const FLOAT_ARRAYS = 13;
const BYTE_ARRAYS = 2;
/** Room kept for the table of powers (floats) and for what the rows lose (doubles): more than any grid asks for. */
const MOST_POWERS = 8192;
const MOST_ROWS = 8192;
/** The most memory the module built for a shared memory may be given (its --max-memory), in pages. */
const SHARED_MOST_PAGES = 32_768;

interface KernelExports {
    __heap_base: WebAssembly.Global;
    __stack_pointer: WebAssembly.Global;
    flux(move: number, rowFrom: number, rowTo: number): void;
    afford(move: number, rowFrom: number, rowTo: number): void;
    scale(move: number, rowFrom: number, rowTo: number): number;
    depths(move: number, rowFrom: number, rowTo: number, rowLost: number, moved: number): void;
    step(move: number, moves: number, lost: number, rowLost: number, moved: number): number;
}

const compiled: { plain?: WebAssembly.Module; shared?: WebAssembly.Module } = {};

function kernelModule(shared: boolean): WebAssembly.Module {
    const known = shared ? compiled.shared : compiled.plain;
    if (known) return known;
    const binary = atob(shared ? WATER_KERNEL_SHARED_WASM_BASE64 : WATER_KERNEL_WASM_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const module = new WebAssembly.Module(bytes);
    if (shared) compiled.shared = module;
    else compiled.plain = module;
    return module;
}

/** What a kernel works with once it is loaded: its memory, the module on it, and the slot of this thread. */
interface Loaded {
    memory: WebAssembly.Memory;
    kernel: KernelExports;
    view: DataView;
    /** Where the Move of this thread and its `moved` are. */
    move: number;
    moved: number;
    movedView: Int32Array;
    /** Where the stack of this thread starts (it goes down from there, within its slot). */
    stack: number;
    /** Where the next array is cut. */
    next: number;
    end: number;
}

let failure: string | undefined;

/** Loads the module on a memory and takes a slot in it for this thread. */
function load(memory: WebAssembly.Memory, shared: boolean): Loaded {
    const instance = new WebAssembly.Instance(kernelModule(shared), { env: { memory } });
    const kernel = instance.exports as unknown as KernelExports;
    const heapBase = Number(kernel.__heap_base.value);
    // A count of the slots taken, then the slots, then the arrays.
    const counter = new Int32Array(memory.buffer, align(heapBase, 8), 1);
    const slots = counter.byteOffset + 8;
    const slot = shared ? Atomics.add(counter, 0, 1) : counter[0]++;
    if (slot >= MOST_SLOTS) throw new Error("too many threads share the memory of a kernel of the water");
    const move = slots + SLOT_BYTES * slot;
    const moved = move + MOVE_BYTES + 8;
    if (slots + SLOT_BYTES * MOST_SLOTS > RESERVED_PAGES * PAGE_BYTES) {
        throw new Error("the memory of the kernel is not laid out as expected");
    }
    // The stack of this thread: the end of its slot, going down.
    const stack = move + SLOT_BYTES;
    kernel.__stack_pointer.value = stack;
    return {
        memory,
        kernel,
        view: new DataView(memory.buffer),
        move,
        moved,
        movedView: new Int32Array(memory.buffer, moved, 1),
        stack,
        next: RESERVED_PAGES * PAGE_BYTES,
        end: memory.buffer.byteLength,
    };
}

export class WasmWaterKernel implements WaterArrays, CompiledPasses {
    public readonly shared: boolean;
    /** Undefined until the first array is asked for; false when the kernel could not be loaded. */
    private loaded: Loaded | false | undefined;
    /** The tables of powers copied into the memory, by the table they were copied from. */
    private readonly tables = new Map<Float32Array, Float32Array>();
    /** Whether this kernel joined the memory of another thread: it cuts no array there. */
    private readonly joined: boolean;

    /** A kernel for one grid: its memory is made at its first array. `shared`: in a memory threads may share. */
    constructor(options: { shared?: boolean } = {}, joined?: WebAssembly.Memory) {
        this.shared = options.shared === true;
        this.joined = joined !== undefined;
        if (joined) this.loaded = load(joined, true);
    }

    /** The kernel of a thread that follows the passes of a grid, on the memory of that grid (threadMemory). */
    public static join(memory: WebAssembly.Memory): WasmWaterKernel {
        return new WasmWaterKernel({ shared: true }, memory);
    }

    /** Why the compiled kernel cannot be had here; undefined when it can. */
    public static unavailable(shared = false): string | undefined {
        const probe = new WasmWaterKernel({ shared });
        probe.floats(1);
        return probe.ready() ? undefined : (failure ?? "it could not be loaded");
    }

    /** Whether the compiled passes are to be had: false where the kernel could not be loaded. */
    public ready(): boolean {
        return this.loaded !== undefined && this.loaded !== false;
    }

    /** Where the stack of this thread starts in the memory: its own, whoever else works there. */
    public stackTop(): number | undefined {
        return this.loaded ? this.loaded.stack : undefined;
    }

    /** The memory the threads that follow the passes of this grid join; undefined when it is not shared. */
    public threadMemory(): WebAssembly.Memory | undefined {
        return this.shared && this.loaded ? this.loaded.memory : undefined;
    }

    public floats(length: number): Float32Array {
        const loaded = this.memoryFor(length);
        if (!loaded) return (this.shared ? sharedWaterArrays : ordinaryWaterArrays).floats(length);
        const at = align(loaded.next, 4);
        this.take(loaded, at + 4 * length);
        return new Float32Array(loaded.memory.buffer, at, length);
    }

    public bytes(length: number): Uint8Array {
        const loaded = this.memoryFor(length);
        if (!loaded) return (this.shared ? sharedWaterArrays : ordinaryWaterArrays).bytes(length);
        const at = loaded.next;
        this.take(loaded, at + length);
        return new Uint8Array(loaded.memory.buffer, at, length);
    }

    public doubles(length: number): Float64Array {
        const loaded = this.memoryFor(length);
        if (!loaded) return (this.shared ? sharedWaterArrays : ordinaryWaterArrays).doubles(length);
        const at = align(loaded.next, 8);
        this.take(loaded, at + 8 * length);
        return new Float64Array(loaded.memory.buffer, at, length);
    }

    /** A table of floats (the powers of the depths) as the kernel reads it: copied once into its memory. */
    public table(from: Float32Array): Float32Array {
        if (!this.loaded) return from;
        let copy = this.tables.get(from);
        if (!copy) {
            copy = this.floats(from.length);
            copy.set(from);
            this.tables.set(from, copy);
        }
        return copy;
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
        const loaded = this.write(move);
        loaded.movedView[0] = 0;
        const total = loaded.kernel.step(loaded.move, moves, lost, rowLost.byteOffset, loaded.moved);
        return { lost: total, moved: loaded.movedView[0] !== 0 };
    }

    /** The passes one by one, over a range of rows: what several threads call each on its own rows. */
    public fluxPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
        const loaded = this.write(move);
        loaded.kernel.flux(loaded.move, rowFrom, rowTo);
    }

    public affordPass(move: InertiaMove, rowFrom: number, rowTo: number): void {
        const loaded = this.write(move);
        loaded.kernel.afford(loaded.move, rowFrom, rowTo);
    }

    public scalePass(move: InertiaMove, rowFrom: number, rowTo: number): boolean {
        const loaded = this.write(move);
        return loaded.kernel.scale(loaded.move, rowFrom, rowTo) !== 0;
    }

    public depthsPass(move: InertiaMove, rowFrom: number, rowTo: number, rowLost: Float64Array): boolean {
        const loaded = this.write(move);
        loaded.movedView[0] = 0;
        loaded.kernel.depths(loaded.move, rowFrom, rowTo, rowLost.byteOffset, loaded.moved);
        return loaded.movedView[0] !== 0;
    }

    /** The memory, made at the first array for a grid of that many cells; undefined where it cannot be had. */
    private memoryFor(cells: number): Loaded | undefined {
        if (this.loaded !== undefined) return this.loaded || undefined;
        if (this.joined || cells <= 0) return undefined;
        this.loaded = false;
        if (typeof WebAssembly === "undefined") {
            failure = "WebAssembly is not available here";
            return undefined;
        }
        try {
            // The stack of the module and the slots of the threads, then the tables and the arrays of the grid.
            const bytes =
                RESERVED_PAGES * PAGE_BYTES +
                4 * MOST_POWERS +
                8 * MOST_ROWS +
                (4 * FLOAT_ARRAYS + BYTE_ARRAYS) * cells +
                256;
            const pages = Math.ceil(bytes / PAGE_BYTES);
            if (this.shared && pages > SHARED_MOST_PAGES) throw new Error("the grid is too large for a shared memory");
            const memory = new WebAssembly.Memory(
                this.shared ? { initial: pages, maximum: pages, shared: true } : { initial: pages },
            );
            this.loaded = load(memory, this.shared);
            return this.loaded;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            // Said once, not at every grid.
            if (failure !== reason) {
                console.warn("The compiled kernel of the water could not be loaded: computing in TypeScript", error);
            }
            failure = reason;
            return undefined;
        }
    }

    private take(loaded: Loaded, next: number): void {
        if (next > loaded.end) throw new Error("The memory of the kernel of the water is full");
        loaded.next = next;
    }

    /** Lays the Move out as water_kernel.c reads it, in the slot of this thread. */
    private write(move: InertiaMove): Loaded {
        const loaded = this.loaded;
        if (!loaded) throw new Error("The compiled kernel of the water is not loaded");
        const view = loaded.view;
        let at = loaded.move;
        const int = (value: number): void => {
            view.setInt32(at, value, true);
            at += 4;
        };
        int(move.width);
        int(move.height);
        int(move.powers.length - 1);
        int(move.depth.byteOffset);
        int(move.ground.byteOffset);
        int(move.spill.byteOffset);
        int(move.closed.byteOffset);
        int(move.hollow.byteOffset);
        int(move.rough.byteOffset);
        int(move.powers.byteOffset);
        int(move.east.byteOffset);
        int(move.south.byteOffset);
        int(move.afford.byteOffset);
        int(move.speedEast.byteOffset);
        int(move.speedSouth.byteOffset);
        int(move.nextSpeedEast.byteOffset);
        int(move.nextSpeedSouth.byteOffset);
        at = loaded.move + MOVE_FIGURES_AT;
        view.setFloat64(at, move.dt, true);
        view.setFloat64(at + 8, move.swiftest, true);
        view.setFloat64(at + 16, move.pull, true);
        view.setFloat64(at + 24, move.pulled, true);
        view.setFloat64(at + 32, move.edgeShare, true);
        view.setFloat64(at + 40, move.top, true);
        view.setFloat64(at + 48, move.roughness, true);
        view.setFloat64(at + 56, move.damping, true);
        view.setFloat64(at + 64, move.breaking, true);
        view.setFloat64(at + 72, move.carried, true);
        // After the figures: the pressure of the air (read only when pressed).
        view.setInt32(at + 80, move.head.byteOffset, true);
        view.setInt32(at + 84, move.pressed === 1 ? 1 : 0, true);
        return loaded;
    }
}

function align(value: number, to: number): number {
    return Math.ceil(value / to) * to;
}
