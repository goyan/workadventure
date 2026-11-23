import { workerData } from "node:worker_threads";
import type { GroundBandStart } from "../../src/Model/Ground/GroundBands";

/**
 * A thread of the bands that goes wrong, for the tests: `fault` "stuck" claims a slice of the first pass it sees and
 * never computes it (a thread lost in the middle of a slice); "throws" claims one and fails.
 */
const { board, fault } = workerData as GroundBandStart & { fault: "stuck" | "throws" };
const TURN = 0;
const CLAIM = 1;
const DONE = 2;
const FAILED = 8;

Atomics.wait(board.words, TURN, 0);
for (;;) {
    const claim = Atomics.load(board.words, CLAIM);
    if (claim < 0) continue;
    if (Atomics.compareExchange(board.words, CLAIM, claim, claim + 1) === claim) break;
}
if (fault === "throws") {
    Atomics.store(board.words, FAILED, 1);
    Atomics.add(board.words, DONE, 1);
    Atomics.notify(board.words, DONE);
    throw new Error("A pass that fails, for the test");
}
// Stuck for good, the slice claimed and not computed.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
