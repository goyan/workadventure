/**
 * How long the ground of the rooms takes where it is computed: the duration of each step of the water, and the time
 * the steps of the water and of the meadow take of their thread. Counted on the thread that computes (the thread of
 * the rooms, or a thread of the grounds, with or without bands), read by the metrics of the server (GroundMetrics).
 *
 * Nothing is kept by room, and no duration is kept one by one: they fall in buckets 5 % apart, so that a window of
 * any length costs the same memory, and a thread of the grounds sends its buckets once a second.
 */

/** The shortest duration told apart (ms), and how much longer each bucket is than the one before. */
const SHORTEST_MS = 0.01;
const BUCKET_RATIO = 1.05;
/** Enough buckets for a step of a minute. */
const BUCKETS = 321;
const LOG_RATIO = Math.log(BUCKET_RATIO);

/** The bucket a duration falls in: the first whose upper bound holds it. */
function bucketOf(ms: number): number {
    if (!(ms > SHORTEST_MS)) return 0;
    return Math.min(BUCKETS - 1, Math.ceil(Math.log(ms / SHORTEST_MS) / LOG_RATIO));
}

/** The longest duration a bucket holds (ms). */
function boundOf(bucket: number): number {
    return SHORTEST_MS * Math.pow(BUCKET_RATIO, bucket);
}

/** What a thread counted since it was last asked: sent as it is from a thread of the grounds. */
export interface GroundTimingsBatch {
    /** The steps of the water by bucket of duration: [bucket, steps], the buckets without a step left out. */
    steps: [number, number][];
    /** The longest step of the water (ms). */
    longestMs: number;
    /** The time the steps of the water and of the meadow took of the thread (ms), over `spanMs` of its time. */
    busyMs: number;
    spanMs: number;
    /**
     * Where the passes of the water are shared between bands (GROUND_BANDS): the steps by bucket of the time the
     * thread waited in them for slices its bands had claimed, the longest of these waits (ms), and how many times
     * the wait was too long and the thread went on alone for a while. Absent where nothing was shared.
     */
    bandWaits?: [number, number][];
    longestBandWaitMs?: number;
    bandsLeftAlone?: number;
}

/** The steps of one thread, counted as they are computed. */
export class GroundTimings {
    private readonly counts = new Uint32Array(BUCKETS);
    private longestMs = 0;
    private busyMs = 0;
    private since: number;
    private readonly bandWaits = new Uint32Array(BUCKETS);
    private longestBandWaitMs = 0;
    private bandsLeftAlone = 0;
    private bandSteps = 0;

    constructor(private readonly clock: () => number = () => performance.now()) {
        this.since = this.clock();
    }

    /** A step of the water took `stepMs`, and `busyMs` with what follows it on its thread (its copy for the room). */
    public waterStepped(stepMs: number, busyMs = stepMs): void {
        if (!Number.isFinite(stepMs) || stepMs < 0) return;
        this.counts[bucketOf(stepMs)]++;
        if (stepMs > this.longestMs) this.longestMs = stepMs;
        this.took(busyMs);
    }

    /** The ground took `ms` of its thread, outside a step of the water (a step of the meadow). */
    public took(ms: number): void {
        if (Number.isFinite(ms) && ms > 0) this.busyMs += ms;
    }

    /**
     * A step of the water whose passes were shared: the thread waited `waitedMs` in it for slices its bands had
     * claimed; `alone`, the wait was too long, and it computes alone for a while.
     */
    public bandsWaited(waitedMs: number, alone: boolean): void {
        if (!Number.isFinite(waitedMs) || waitedMs < 0) return;
        this.bandWaits[bucketOf(waitedMs)]++;
        this.bandSteps++;
        if (waitedMs > this.longestBandWaitMs) this.longestBandWaitMs = waitedMs;
        if (alone) this.bandsLeftAlone++;
    }

    /** What was counted since the last time, which is then forgotten. */
    public take(): GroundTimingsBatch {
        const steps: [number, number][] = [];
        for (let bucket = 0; bucket < BUCKETS; bucket++) {
            if (this.counts[bucket] > 0) steps.push([bucket, this.counts[bucket]]);
        }
        const now = this.clock();
        const batch: GroundTimingsBatch = {
            steps,
            longestMs: this.longestMs,
            busyMs: this.busyMs,
            spanMs: Math.max(0, now - this.since),
        };
        if (this.bandSteps > 0) {
            batch.bandWaits = [];
            for (let bucket = 0; bucket < BUCKETS; bucket++) {
                if (this.bandWaits[bucket] > 0) batch.bandWaits.push([bucket, this.bandWaits[bucket]]);
            }
            batch.longestBandWaitMs = this.longestBandWaitMs;
            batch.bandsLeftAlone = this.bandsLeftAlone;
            this.bandWaits.fill(0);
            this.longestBandWaitMs = 0;
            this.bandsLeftAlone = 0;
            this.bandSteps = 0;
        }
        this.counts.fill(0);
        this.longestMs = 0;
        this.busyMs = 0;
        this.since = now;
        return batch;
    }
}

/** The steps of the ground computed on this thread. */
export const threadGroundTimings = new GroundTimings();

/** What the metrics read: the steps of the water of all the threads, and the share each thread gave its grounds. */
export interface GroundTimingsWindow {
    steps: number;
    /** The duration under which half, 90 % and 99 % of the steps of the water were (ms, 5 % over at most), and the longest. */
    p50Ms: number;
    p90Ms: number;
    p99Ms: number;
    longestMs: number;
    /** By thread ("rooms": the thread of the rooms; "1", "2"...: a thread of the grounds), the share of its time (0 to 1). */
    busy: Map<string, number>;
    /**
     * The steps whose passes were shared between bands, the wait under which 99 % of them were and the longest (ms:
     * what the threads of the grounds waited, in a step, for slices their bands had claimed), and how many times a
     * thread went on alone for a while, its wait having been too long.
     */
    bandSteps: number;
    bandWaitP99Ms: number;
    longestBandWaitMs: number;
    bandsLeftAlone: number;
}

/** Gathers what the threads counted, between two readings of the metrics. */
export class GroundTimingsBoard {
    private readonly counts = new Float64Array(BUCKETS);
    private longestMs = 0;
    private readonly bandWaits = new Float64Array(BUCKETS);
    private longestBandWaitMs = 0;
    private bandsLeftAlone = 0;
    private readonly threads = new Map<string, { busyMs: number; spanMs: number }>();

    constructor(
        /** The steps computed on the thread of the rooms itself. */
        private readonly here: GroundTimings = threadGroundTimings,
    ) {}

    /** What a thread counted: `thread` names it among the threads of the server, never a room. */
    public add(thread: string, batch: GroundTimingsBatch): void {
        for (const [bucket, steps] of batch.steps) {
            if (Number.isInteger(bucket) && bucket >= 0 && bucket < BUCKETS && steps > 0) this.counts[bucket] += steps;
        }
        if (batch.longestMs > this.longestMs) this.longestMs = batch.longestMs;
        for (const [bucket, steps] of batch.bandWaits ?? []) {
            if (Number.isInteger(bucket) && bucket >= 0 && bucket < BUCKETS && steps > 0)
                this.bandWaits[bucket] += steps;
        }
        if ((batch.longestBandWaitMs ?? 0) > this.longestBandWaitMs)
            this.longestBandWaitMs = batch.longestBandWaitMs ?? 0;
        this.bandsLeftAlone += batch.bandsLeftAlone ?? 0;
        const known = this.threads.get(thread) ?? { busyMs: 0, spanMs: 0 };
        known.busyMs += batch.busyMs;
        known.spanMs += batch.spanMs;
        this.threads.set(thread, known);
    }

    /** What was counted since the last reading, which is then forgotten. */
    public read(): GroundTimingsWindow {
        this.add("rooms", this.here.take());
        let steps = 0;
        for (let bucket = 0; bucket < BUCKETS; bucket++) steps += this.counts[bucket];
        const under = (share: number): number => {
            if (steps === 0) return 0;
            let seen = 0;
            for (let bucket = 0; bucket < BUCKETS; bucket++) {
                seen += this.counts[bucket];
                if (seen >= share * steps) return Math.min(boundOf(bucket), this.longestMs);
            }
            return this.longestMs;
        };
        const busy = new Map<string, number>();
        for (const [thread, { busyMs, spanMs }] of this.threads) {
            if (spanMs > 0) busy.set(thread, Math.min(1, busyMs / spanMs));
        }
        let bandSteps = 0;
        for (let bucket = 0; bucket < BUCKETS; bucket++) bandSteps += this.bandWaits[bucket];
        let bandWaitP99Ms = 0;
        let seenWaits = 0;
        for (let bucket = 0; bandSteps > 0 && bucket < BUCKETS; bucket++) {
            seenWaits += this.bandWaits[bucket];
            if (seenWaits >= 0.99 * bandSteps) {
                bandWaitP99Ms = Math.min(boundOf(bucket), this.longestBandWaitMs);
                break;
            }
        }
        const read = {
            steps,
            p50Ms: under(0.5),
            p90Ms: under(0.9),
            p99Ms: under(0.99),
            longestMs: this.longestMs,
            busy,
            bandSteps,
            bandWaitP99Ms,
            longestBandWaitMs: this.longestBandWaitMs,
            bandsLeftAlone: this.bandsLeftAlone,
        };
        this.bandWaits.fill(0);
        this.longestBandWaitMs = 0;
        this.bandsLeftAlone = 0;
        this.counts.fill(0);
        this.longestMs = 0;
        this.threads.clear();
        return read;
    }
}

/** What the threads of this server counted, for its metrics. */
export const groundTimingsBoard = new GroundTimingsBoard();
