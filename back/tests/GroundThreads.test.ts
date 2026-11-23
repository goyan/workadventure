import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroundTold } from "../src/Model/Ground/GroundProtocol";
import { GroundThreads } from "../src/Model/Ground/GroundThreads";
import type { GroundThread } from "../src/Model/Ground/GroundThreads";

/** A thread that does nothing, and can be lost. */
function fakeThread(): GroundThread & { lose(): void } {
    const listeners: { exit?: (code: number) => void } = {};
    return {
        postMessage: () => undefined,
        on: (
            event: string,
            listener: ((told: GroundTold) => void) | ((error: unknown) => void) | ((code: number) => void),
        ) => {
            if (event === "exit") listeners.exit = listener as (code: number) => void;
        },
        terminate: () => undefined,
        lose: () => listeners.exit?.(1),
    };
}

describe("the threads that compute the ground of the rooms (GroundThreads)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("says in the logs when a thread starts for its first room, and when it starts again after a loss", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const made: ReturnType<typeof fakeThread>[] = [];
        const threads = new GroundThreads(2, () => {
            const thread = fakeThread();
            made.push(thread);
            return thread;
        });
        // No thread until a room needs one.
        expect(info).not.toHaveBeenCalled();

        const first = threads.assign();
        let lost = 0;
        first.port.listen(
            first.room,
            () => undefined,
            () => lost++,
        );
        first.port.post({ kind: "close", room: first.room });
        expect(info).toHaveBeenLastCalledWith("Ground thread 1 of 2 starts for its first room");
        // More commands, the same thread: nothing more is said.
        first.port.post({ kind: "close", room: first.room });
        expect(info).toHaveBeenCalledTimes(1);

        // The second room goes to the thread that has none.
        const second = threads.assign();
        second.port.listen(
            second.room,
            () => undefined,
            () => undefined,
        );
        second.port.post({ kind: "close", room: second.room });
        expect(info).toHaveBeenLastCalledWith("Ground thread 2 of 2 starts for its first room");

        made[0].lose();
        expect(lost).toBe(1);
        first.port.post({ kind: "close", room: first.room });
        expect(info).toHaveBeenLastCalledWith("Ground thread 1 of 2 starts again after a loss (start 2)");
        expect(made.length).toBe(3);
    });

    it("says why in the logs of the server when a thread dies as it starts, and tells its rooms", async () => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
        // A real thread whose script fails at once, as one that could not load would.
        const threads = new GroundThreads(
            1,
            () => new Worker('throw new Error("could not start: a setting is missing")', { eval: true }),
        );
        const { room, port } = threads.assign();
        const lost = new Promise<void>((resolve) => {
            port.listen(room, () => undefined, resolve);
        });
        port.post({ kind: "close", room });
        await lost;
        expect(errors).toHaveBeenCalledWith(
            "A thread that computes the ground of rooms was lost: its rooms start again",
            expect.objectContaining({ message: "could not start: a setting is missing" }),
        );
        threads.stop();
    });
});
