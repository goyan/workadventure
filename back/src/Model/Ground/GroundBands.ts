import { MessageChannel, Worker } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import { BAND_ALONE_MS, BAND_SLOW_WAIT_MS, WaterBandsLead } from "@workadventure/map-editor";
import type {
    InertiaMove,
    WaterBandsBoard,
    WaterBandsNews,
    WaterPass,
    WaterPassRunner,
} from "@workadventure/map-editor";
import { threadGroundTimings } from "./GroundTimings";

/**
 * What a thread of the bands is told of the grids, before a pass: their arrays, in a memory the threads share, and
 * what computes their passes: the passes written in TypeScript, or the compiled kernel of the grid, whose memory
 * comes with the arrays (the thread loads its own instance of the module on it).
 */
export type GroundBandNews = WaterBandsNews & { kernel: "typescript" | "wasm" };

/** What a thread of the bands is started with. */
export interface GroundBandStart {
    board: WaterBandsBoard;
    /** Where the news of the grids come, read on waking: the thread sleeps between two passes, and hears nothing. */
    news: MessagePort;
}

/** A thread of the bands as the group uses it: a Worker, or what stands for one in a test. */
export interface GroundBandThread {
    on(event: "error", listener: (error: unknown) => void): unknown;
    on(event: "exit", listener: (code: number) => void): unknown;
    terminate(): unknown;
}

/** Starts a thread of the bands (GroundBandWorker), under the same TypeScript loader as this thread. */
function spawnBandWorker(start: GroundBandStart): GroundBandThread {
    const underTsx = process.execArgv.some((argument) => argument.includes("tsx"));
    return new Worker(new URL("./GroundBandWorker.ts", import.meta.url), {
        workerData: start,
        transferList: [start.news],
        ...(underTsx ? {} : { execArgv: ["--import", "tsx"] }),
    });
}

/**
 * The bands of the water of a thread that computes grounds: threads of their own that share with it the passes of
 * each move of its waters, slice of rows by slice of rows (WaterBands). They sleep between two passes and between
 * two steps, and take no core while the water rests.
 *
 * A thread of the bands that ends while it sleeps is left out: the water goes on with one band less, and says so.
 * One lost in the middle of a slice, or whose pass fails, loses the step: `failed` is called with the error, for the
 * thread of the grounds to end and its rooms to start again from the last copy of their water.
 */
export class GroundBands implements WaterPassRunner {
    private readonly lead: WaterBandsLead;
    private readonly threads: { thread: GroundBandThread; news: MessagePort }[] = [];
    private stopped = false;

    constructor(
        /** How many threads share the passes with the thread of the grounds. */
        followers: number,
        /** A thread of the bands was left out: the water goes on with the bands that remain. */
        private readonly left: (reason: string, remaining: number) => void,
        /** The step is lost: the water of the grids of this thread cannot be trusted any more. */
        private readonly failed: (error: unknown) => void,
        spawn: (start: GroundBandStart) => GroundBandThread = spawnBandWorker,
        lead?: WaterBandsLead,
    ) {
        const count = Math.max(0, Math.floor(followers));
        this.lead = lead ?? new WaterBandsLead(count);
        // The wait of this thread for its bands, step after step: for the metrics, and said when it is too long.
        this.lead.watchedBy((waitedMs, alone) => {
            threadGroundTimings.bandsWaited(waitedMs, alone);
            if (alone) {
                console.info(
                    `The water waited ${Math.round(waitedMs)} ms for its bands in one step (over ${BAND_SLOW_WAIT_MS} ms: no core for them): computed on one thread for ${BAND_ALONE_MS / 1000} s`,
                );
            }
        });
        for (let index = 0; index < count; index++) {
            const channel = new MessageChannel();
            const thread = spawn({ board: this.lead.board, news: channel.port2 });
            const entry = { thread, news: channel.port1 };
            this.threads.push(entry);
            const leave = (reason: string): void => {
                const at = this.threads.indexOf(entry);
                if (at < 0 || this.stopped) return;
                this.threads.splice(at, 1);
                entry.news.close();
                this.lead.followedBy(this.threads.length);
                this.left(reason, this.threads.length);
            };
            thread.on("error", (error) => leave(error instanceof Error ? error.message : String(error)));
            thread.on("exit", (code) => leave(`exit ${code}`));
        }
    }

    /** How many bands the water is computed on: this thread and those that share its passes. */
    public get bands(): number {
        return this.threads.length + 1;
    }

    /** The slices computed by this thread and by the others, since the beginning. */
    public computed(): { here: number; others: number } {
        return this.lead.computed();
    }

    public begin(key: object, move: InertiaMove, rowLost: Float64Array): void {
        const news = this.lead.begin(key, move, rowLost);
        if (news.length === 0) return;
        const told: GroundBandNews[] = news.map((one) => ({
            ...one,
            kernel: one.arrays?.memory ? "wasm" : "typescript",
        }));
        for (const { news: port } of this.threads) port.postMessage(told);
    }

    public run(pass: WaterPass): boolean {
        try {
            return this.lead.run(pass);
        } catch (error) {
            // A slice was left half computed: nothing of this thread goes on.
            this.stop();
            this.failed(error);
            throw error;
        }
    }

    public forget(key: object): void {
        this.lead.forget(key);
    }

    /** Ends the threads of the bands: those that sleep wake to be told, one that is stuck is ended. */
    public stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.lead.stop();
        for (const { thread, news } of this.threads.splice(0)) {
            news.close();
            Promise.resolve(thread.terminate()).catch((error: unknown) =>
                console.error("A thread of the bands of the water could not be stopped", error),
            );
        }
        this.lead.followedBy(0);
    }
}
