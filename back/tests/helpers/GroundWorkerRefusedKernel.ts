/**
 * The thread of the grounds of the server (GroundWorker) where the compiled kernel of the water cannot be had, for
 * the tests: compiling its module is refused, as a binary that cannot be read would be.
 */
WebAssembly.Module = function refused(): never {
    throw new Error("refused for the test");
} as unknown as typeof WebAssembly.Module;

await import("../../src/Model/Ground/GroundWorker");

export {};
