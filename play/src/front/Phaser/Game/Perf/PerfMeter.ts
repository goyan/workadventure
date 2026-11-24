/** The figures are given once per window of this length: about twice a second, readable and still lively. */
export const PERF_WINDOW_MS = 500;

/** How the game ran over the last window of images. */
export interface PerfStats {
    /** Images a second: the steps of the game, one at each image of the screen it keeps up with. */
    fps: number;
    /**
     * Of those, the ones the game drew again. It draws the scene only when something changed on it: fewer than
     * `fps` means a scene that hardly moves, not a slow game.
     */
    drawnFps: number;
    /** The longest wait between two images, in ms: a hitch the average hides. */
    worstMs: number;
    /** What an image cost on average, in ms: working out the scene, and drawing it when it was drawn again. */
    updateMs: number;
    renderMs: number;
}

/**
 * Measures how the game runs, for a player who asked to see it: its steps counted over a short window, how many of
 * them drew the scene again, the longest wait between two, and the time each took. Nothing is kept beyond the
 * window.
 */
export class PerfMeter {
    private windowStart: number | undefined;
    private lastStep: number | undefined;
    private steps = 0;
    private draws = 0;
    private worst = 0;
    private update = 0;
    private render = 0;

    /** The scene was drawn again, in `renderMs`. */
    public drawn(renderMs: number): void {
        this.draws += 1;
        this.render += renderMs;
    }

    /**
     * One step of the game, started at `now` (ms), that took `updateMs` to work out the scene. Returns the figures of
     * the window when it is over, undefined otherwise.
     */
    public step(now: number, updateMs: number): PerfStats | undefined {
        if (this.windowStart === undefined || this.lastStep === undefined) {
            this.windowStart = now;
            this.lastStep = now;
            this.draws = 0;
            this.render = 0;
            return undefined;
        }
        this.steps += 1;
        this.worst = Math.max(this.worst, now - this.lastStep);
        this.update += updateMs;
        this.lastStep = now;
        const elapsed = now - this.windowStart;
        if (elapsed < PERF_WINDOW_MS) {
            return undefined;
        }
        const stats: PerfStats = {
            fps: (this.steps * 1000) / elapsed,
            drawnFps: (this.draws * 1000) / elapsed,
            worstMs: this.worst,
            updateMs: this.update / this.steps,
            renderMs: this.draws > 0 ? this.render / this.draws : 0,
        };
        this.windowStart = now;
        this.steps = 0;
        this.draws = 0;
        this.worst = 0;
        this.update = 0;
        this.render = 0;
        return stats;
    }
}
