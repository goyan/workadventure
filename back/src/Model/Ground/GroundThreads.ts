import { Worker } from "node:worker_threads";
import { GROUND_THREADS } from "../../Enum/EnvironmentVariable";
import type { GroundCommand, GroundPort, GroundTold } from "./GroundProtocol";

/** A thread as the grounds use it: a Worker, or what stands for one in a test. */
export interface GroundThread {
    postMessage(command: GroundCommand): void;
    on(event: "message", listener: (told: GroundTold) => void): unknown;
    on(event: "error", listener: (error: unknown) => void): unknown;
    on(event: "exit", listener: (code: number) => void): unknown;
    terminate(): unknown;
}

/** Starts the thread that computes grounds (GroundWorker), under the same TypeScript loader as this process. */
function spawnGroundWorker(): GroundThread {
    // The server runs under tsx, whose loader the threads it starts inherit; elsewhere (the tests) it is asked for.
    const underTsx = process.execArgv.some((argument) => argument.includes("tsx"));
    return new Worker(new URL("./GroundWorker.ts", import.meta.url), underTsx ? {} : { execArgv: ["--import", "tsx"] });
}

/** One thread and the rooms whose ground it computes. */
class Lane implements GroundPort {
    private thread: GroundThread | undefined;
    private readonly rooms = new Map<number, { told: (told: GroundTold) => void; lost: () => void }>();

    /** How many times its thread was started: once, and once more after each loss. */
    private starts = 0;

    constructor(
        private readonly spawn: () => GroundThread,
        /** Its place among the threads of the server, from 1, and how many they are: for the logs. */
        private readonly place: number,
        private readonly of: number,
    ) {}

    public get size(): number {
        return this.rooms.size;
    }

    public post(command: GroundCommand): void {
        this.running().postMessage(command);
    }

    public listen(room: number, told: (told: GroundTold) => void, lost: () => void): void {
        this.rooms.set(room, { told, lost });
    }

    public forget(room: number): void {
        this.rooms.delete(room);
    }

    public stop(): void {
        const thread = this.thread;
        this.thread = undefined;
        Promise.resolve(thread?.terminate()).catch((error: unknown) =>
            console.error("A thread that computes the ground of rooms could not be stopped", error),
        );
    }

    /** The thread of this lane, started when first needed and again after it was lost. */
    private running(): GroundThread {
        if (this.thread) return this.thread;
        const thread = this.spawn();
        this.thread = thread;
        this.starts++;
        // Said once a thread: the server computes the ground of rooms away from the thread of the rooms from now on.
        console.info(
            `Ground thread ${this.place} of ${this.of} ${this.starts === 1 ? "starts for its first room" : `starts again after a loss (start ${this.starts})`}`,
        );
        thread.on("message", (told) => this.rooms.get(told.room)?.told(told));
        const lost = (reason: unknown): void => {
            if (this.thread !== thread) return;
            this.thread = undefined;
            console.error("A thread that computes the ground of rooms was lost: its rooms start again", reason);
            // Each room starts its ground again, on a thread started for the first that asks.
            for (const room of [...this.rooms.values()]) room.lost();
        };
        thread.on("error", lost);
        thread.on("exit", (code) => lost(`exit ${code}`));
        return thread;
    }
}

/**
 * The threads that compute the grounds of the rooms, away from the thread of the rooms: `count` of them at most, each
 * started when a room first needs it. A room is given the thread that has the fewest rooms and keeps it.
 */
export class GroundThreads {
    private readonly lanes: Lane[];
    private rooms = 0;

    constructor(count: number, spawn: () => GroundThread = spawnGroundWorker) {
        const lanes = Math.max(0, Math.floor(count));
        this.lanes = Array.from({ length: lanes }, (_, at) => new Lane(spawn, at + 1, lanes));
    }

    /** How many threads the grounds may use: none, they are computed on the thread of the rooms. */
    public get count(): number {
        return this.lanes.length;
    }

    /** A name for a room on its thread, and the thread it is computed on. */
    public assign(): { room: number; port: GroundPort } {
        if (this.lanes.length === 0) throw new Error("No thread to compute the ground of a room");
        const lane = this.lanes.reduce((least, candidate) => (candidate.size < least.size ? candidate : least));
        return { room: ++this.rooms, port: lane };
    }

    public stop(): void {
        for (const lane of this.lanes) lane.stop();
    }
}

/** The threads of this server for the grounds of its rooms: as many as GROUND_THREADS says, none when it says nothing. */
export const groundThreads = new GroundThreads(GROUND_THREADS);
console.info(
    groundThreads.count > 0
        ? `The ground of the rooms (water and meadow) is computed on ${groundThreads.count} thread(s) of its own (GROUND_THREADS)`
        : "The ground of the rooms (water and meadow) is computed on the thread of the rooms (GROUND_THREADS is 0)",
);
