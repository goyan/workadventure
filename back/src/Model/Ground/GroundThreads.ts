import { Worker } from "node:worker_threads";
import { WATER_BANDS_ERROR } from "@workadventure/map-editor";
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
function spawnGroundWorker(bands: number): GroundThread {
    // The server runs under tsx, whose loader the threads it starts inherit; elsewhere (the tests) it is asked for.
    const underTsx = process.execArgv.some((argument) => argument.includes("tsx"));
    return new Worker(new URL("./GroundWorker.ts", import.meta.url), {
        workerData: { bands },
        ...(underTsx ? {} : { execArgv: ["--import", "tsx"] }),
    });
}

/** Threads of the bands lost this many times by a thread of the grounds: its water is computed without bands. */
export const BAND_LOSSES_BEFORE_NONE = 3;

/** One thread and the rooms whose ground it computes. */
class Lane implements GroundPort {
    private thread: GroundThread | undefined;
    private readonly rooms = new Map<number, { told: (told: GroundTold) => void; lost: () => void }>();

    /** How many times its thread was started: once, and once more after each loss. */
    private starts = 0;
    /** How many times a thread of the bands of its water was lost, asleep or in the middle of a step. */
    private bandLosses = 0;
    /** The slices of rows its thread computed itself, and those the threads of its bands computed, as last told. */
    public sliced = { here: 0, others: 0 };

    constructor(
        private readonly spawn: (bands: number) => GroundThread,
        /** On how many bands the water of its rooms is computed: 1, this thread alone. */
        private readonly bands: number,
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
        // A thread of the bands lost is not started again: one band less each time, then none.
        const bands = this.bandLosses >= BAND_LOSSES_BEFORE_NONE ? 1 : Math.max(1, this.bands - this.bandLosses);
        const thread = this.spawn(bands);
        this.thread = thread;
        this.starts++;
        // Said once a thread: the server computes the ground of rooms away from the thread of the rooms from now on.
        console.info(
            `Ground thread ${this.place} of ${this.of} ${this.starts === 1 ? "starts for its first room" : `starts again after a loss (start ${this.starts})`}`,
        );
        thread.on("message", (told) => {
            if (told.kind === "band") this.bandLost();
            else if (told.kind === "slices") this.sliced = { here: told.here, others: told.others };
            else this.rooms.get(told.room)?.told(told);
        });
        const lost = (reason: unknown): void => {
            if (this.thread !== thread) return;
            this.thread = undefined;
            // A step lost to the bands of the water: the thread that starts again has one band less.
            if (reason instanceof Error && reason.message.includes(WATER_BANDS_ERROR)) this.bandLost();
            console.error("A thread that computes the ground of rooms was lost: its rooms start again", reason);
            // Each room starts its ground again, on a thread started for the first that asks.
            for (const room of [...this.rooms.values()]) room.lost();
        };
        thread.on("error", lost);
        thread.on("exit", (code) => lost(`exit ${code}`));
        return thread;
    }

    private bandLost(): void {
        this.bandLosses++;
        if (this.bands > 1 && this.bandLosses === BAND_LOSSES_BEFORE_NONE) {
            console.error(
                `Ground thread ${this.place} of ${this.of} lost threads of the bands of its water ${BAND_LOSSES_BEFORE_NONE} times: its water is computed without bands from now on`,
            );
        }
    }
}

/**
 * The threads that compute the grounds of the rooms, away from the thread of the rooms: `count` of them at most, each
 * started when a room first needs it. A room is given the thread that has the fewest rooms and keeps it.
 */
export class GroundThreads {
    private readonly lanes: Lane[];
    private rooms = 0;

    /** On how many bands each thread computes the water of its rooms: 1, the thread alone. */
    public readonly bands: number;

    constructor(count: number, spawn: (bands: number) => GroundThread = spawnGroundWorker, bands = 1) {
        const lanes = Math.max(0, Math.floor(count));
        this.bands = Math.max(1, Math.floor(bands));
        this.lanes = Array.from({ length: lanes }, (_, at) => new Lane(spawn, this.bands, at + 1, lanes));
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

    /**
     * How the passes of the waters were shared on the threads, as each told when one of its rooms last closed: the
     * slices of rows the threads of the grounds computed themselves, and those the threads of their bands computed.
     */
    public slices(): { here: number; others: number } {
        return this.lanes.reduce(
            (sum, lane) => ({ here: sum.here + lane.sliced.here, others: sum.others + lane.sliced.others }),
            { here: 0, others: 0 },
        );
    }

    public stop(): void {
        for (const lane of this.lanes) lane.stop();
    }
}
