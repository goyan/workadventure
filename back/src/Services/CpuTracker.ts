import { CPU_OVERHEAT_THRESHOLD } from "../Enum/EnvironmentVariable";

function secNSec2ms(secNSec: Array<number> | number) {
    if (Array.isArray(secNSec)) {
        return secNSec[0] * 1000 + secNSec[1] / 1000000;
    }
    return secNSec / 1000;
}

/**
 * The processor time of the thread that calls it (µs), since the thread started: on the main thread, what serves the
 * players. Not `process.cpuUsage()`, which adds up every thread of the process: since the ground of the rooms may be
 * computed on threads of its own (GROUND_THREADS), their water took most of a core and put the server in "overheat"
 * while the thread of the players was idle (measured on the beta: 60 % of a core for the water, 9 % for the players).
 * Without such threads the two figures differ by what V8 does on its own threads (the memory it cleans, the code it
 * compiles): a few percent. A Node that cannot tell the time of a thread (before 23.9) is asked for the process.
 */
export function playersThreadCpuUsage(): NodeJS.CpuUsage {
    return typeof process.threadCpuUsage === "function" ? process.threadCpuUsage() : process.cpuUsage();
}

export class CpuTracker {
    private cpuPercent = 0;
    private overHeating = false;
    private time: bigint;
    private usage: NodeJS.CpuUsage;

    constructor(
        private readonly threshold: number = CPU_OVERHEAT_THRESHOLD,
        /** The processor time taken so far by what the tracker watches: the thread of the players. */
        private readonly cpuUsage: () => NodeJS.CpuUsage = playersThreadCpuUsage,
        /** Reads itself ten times a second; a test reads it by hand (`sample`). */
        selfTimed = true,
    ) {
        this.time = process.hrtime.bigint();
        this.usage = this.cpuUsage();
        if (selfTimed) setInterval(() => this.sample(), 100);
    }

    /** The share of the time since the last reading that the thread of the players spent computing. */
    public sample(): void {
        const elapTime = process.hrtime.bigint();
        const usage = this.cpuUsage();

        const elapTimeMS = elapTime - this.time;
        const elapUserMS = secNSec2ms(usage.user - this.usage.user);
        const elapSystMS = secNSec2ms(usage.system - this.usage.system);
        this.cpuPercent = Math.round(((100 * (elapUserMS + elapSystMS)) / Number(elapTimeMS)) * 1000000);

        this.time = elapTime;
        this.usage = usage;

        if (!this.overHeating && this.cpuPercent > this.threshold) {
            this.overHeating = true;
            console.warn('CPU high threshold alert. Going in "overheat" mode');
        } else if (this.overHeating && this.cpuPercent <= this.threshold) {
            this.overHeating = false;
            console.info('CPU is back to normal. Canceling "overheat" mode');
        }
    }

    public getCpuPercent(): number {
        return this.cpuPercent;
    }

    public isOverHeating(): boolean {
        return this.overHeating;
    }
}

const cpuTracker = new CpuTracker();

export { cpuTracker };
