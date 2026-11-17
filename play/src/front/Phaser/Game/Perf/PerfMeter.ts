/** The figures are given once per window of this length: about twice a second, readable and still lively. */
export const PERF_WINDOW_MS = 500;

/** How the game ran over the last window of images. */
export interface PerfStats {
    /** Images worked out a second. */
    fps: number;
    /** The longest wait between two images, in ms: a hitch the average hides. */
    worstMs: number;
    /** What an image cost on average, in ms: working out the scene, and drawing it. */
    updateMs: number;
    renderMs: number;
}

/**
 * Measures how the game runs, for a player who asked to see it: the images counted over a short window, the longest
 * wait between two of them, and the time each took. Nothing is kept beyond the window.
 */
export class PerfMeter {
    private windowStart: number | undefined;
    private lastFrame: number | undefined;
    private frames = 0;
    private worst = 0;
    private update = 0;
    private render = 0;

    /**
     * One image, started at `now` (ms), that took `updateMs` to work out and `renderMs` to draw. Returns the figures of
     * the window when it is over, undefined otherwise.
     */
    public frame(now: number, updateMs: number, renderMs: number): PerfStats | undefined {
        if (this.windowStart === undefined || this.lastFrame === undefined) {
            this.windowStart = now;
            this.lastFrame = now;
            return undefined;
        }
        this.frames += 1;
        this.worst = Math.max(this.worst, now - this.lastFrame);
        this.update += updateMs;
        this.render += renderMs;
        this.lastFrame = now;
        const elapsed = now - this.windowStart;
        if (elapsed < PERF_WINDOW_MS) {
            return undefined;
        }
        const stats: PerfStats = {
            fps: (this.frames * 1000) / elapsed,
            worstMs: this.worst,
            updateMs: this.update / this.frames,
            renderMs: this.render / this.frames,
        };
        this.windowStart = now;
        this.frames = 0;
        this.worst = 0;
        this.update = 0;
        this.render = 0;
        return stats;
    }
}
