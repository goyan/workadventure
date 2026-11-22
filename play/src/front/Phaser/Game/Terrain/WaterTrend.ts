/**
 * How fast the level of the water rises or falls over a few seconds, cell by cell, the waves left out: what the view
 * of the flows of the water tints. Between two states a second apart, the level of a sea that ripples goes up then
 * down (its waves last 2 to 4 s in the model): the difference of two states tells the ripple, not the trend.
 */

/**
 * The trend is the rate between two states smoothed twice over this many seconds (two exponential filters in a row):
 * a ripple of 3 s comes through at a seventieth of its rate, a steady rise at its whole rate. The 1 s a state is
 * already taken over would change nothing.
 */
export const TREND_SECONDS = 4;
/** How long the agitation of the water is remembered, in seconds: the waves of that water. */
export const AGITATION_SECONDS = 10;
/**
 * A trend under this, in pixels a second, is neither a rise nor a fall: 0.06 px a second is 2 mm a second, 12 cm a
 * minute (a pixel of water is 3.4 cm).
 */
export const STEADY_PX_PER_SECOND = 0.06;
/**
 * Rough water needs a trend of at least this share of its agitation (the root mean square of its rate over a
 * second): what its waves leave of the smoothing is about a twentieth of it.
 */
export const AGITATION_SHARE = 0.15;
/** A rise or a fall shown stays shown until its trend drops under this share of what showed it. */
export const HOLD_SHARE = 0.5;
/**
 * With no state for this long, the server has nothing to tell: no cell moved a quarter of a pixel. The water is
 * still, and the trend dies down.
 */
export const SILENCE_MS = 2000;
/** Nothing is shown before the agitation of the water was sampled this many times: the waves are not known yet. */
const FIRST_SAMPLES = 3;
/**
 * The agitation is sampled over about a second, whatever the number of states a second the map asks for (1 to 10):
 * from 0.75 s on, so that states that come 0.8 s apart are each a sample.
 */
const AGITATION_SAMPLE_MS = 750;
/** Two states closer than this are a tenth of a second apart (that of the glide of the water). */
const SHORTEST_GAP_MS = 100;

/**
 * The trend of each cell of the grid of the water, fed with the states the server sends. Its arrays are its own:
 * read, never written.
 */
export class WaterTrend {
    /** The first filter, then the second: the trend, in pixels a second. */
    private first = new Float32Array(0);
    private second = new Float32Array(0);
    /** The mean square of the rate over a second (pixels a second, squared). */
    private agitation = new Float32Array(0);
    /** The depths at the start of the second being sampled. */
    private anchor = new Float32Array(0);
    private anchorAt = 0;
    /** How much of the mean square is filled in (it starts empty): what it is divided by. */
    private agitationWeight = 0;
    private samples = 0;
    /** 1 for a rise shown, -1 for a fall, 0 for neither. */
    private signs = new Int8Array(0);
    private at = 0;

    /** Starts again from these depths (a first state, or another grid): no trend yet. */
    public reset(depths: Float32Array, now: number): void {
        const cells = depths.length;
        this.first = new Float32Array(cells);
        this.second = new Float32Array(cells);
        this.agitation = new Float32Array(cells);
        this.anchor = Float32Array.from(depths);
        this.signs = new Int8Array(cells);
        this.at = now;
        this.anchorAt = now;
        this.agitationWeight = 0;
        this.samples = 0;
    }

    /** A new state, `after`, which came at `now` (ms) after `before`. */
    public add(before: Float32Array, after: Float32Array, now: number): void {
        const cells = after.length;
        if (before.length !== cells || this.second.length !== cells) {
            this.reset(after, now);
            return;
        }
        const gapMs = Math.max(SHORTEST_GAP_MS, now - this.at);
        this.at = now;
        const sampled = now - this.anchorAt >= AGITATION_SAMPLE_MS;
        const sampleSeconds = (now - this.anchorAt) / 1000;
        const keep = Math.exp(-sampleSeconds / AGITATION_SECONDS);
        if (sampled) {
            this.anchorAt = now;
            this.agitationWeight = 1 - keep + this.agitationWeight * keep;
            this.samples++;
        }
        const filter = filterOver(gapMs / 1000);
        for (let index = 0; index < cells; index++) {
            this.advance(index, (after[index] - before[index]) / (gapMs / 1000), filter);
            if (sampled) {
                const rate = (after[index] - this.anchor[index]) / sampleSeconds;
                this.agitation[index] = rate * rate + (this.agitation[index] - rate * rate) * keep;
                this.anchor[index] = after[index];
            }
            this.decide(index);
        }
    }

    /** The time of the game is `now` (ms): with no state for a while, the water is still and the trend dies down. */
    public idle(now: number): void {
        if (now - this.at < SILENCE_MS) return;
        const seconds = (now - this.at) / 1000;
        this.at = now;
        const filter = filterOver(seconds);
        const keep = Math.exp(-seconds / AGITATION_SECONDS);
        for (let index = 0; index < this.second.length; index++) {
            this.advance(index, 0, filter);
            this.agitation[index] *= keep;
            this.decide(index);
        }
    }

    /** The trend of each cell, in pixels a second: positive when the level rises. */
    public trend(): Float32Array {
        return this.second;
    }

    /** Whether the waves of the water were sampled long enough to tell a trend: before, nothing is shown. */
    public ready(): boolean {
        return this.samples >= FIRST_SAMPLES;
    }

    /** Whether each cell shows a rise (1), a fall (-1) or neither (0). */
    public shown(): Int8Array {
        return this.signs;
    }

    /** Both filters, over a time the rate held: solved exactly, so that states closer or further apart weigh right. */
    private advance(index: number, rate: number, filter: Filter): void {
        const first = this.first[index] - rate;
        const second = this.second[index] - rate;
        this.first[index] = rate + first * filter.decay;
        this.second[index] = rate + second * filter.decay + first * filter.carry;
    }

    /** Shows a rise or a fall over the threshold of that water, until its trend drops well under it. */
    private decide(index: number): void {
        const trend = this.second[index];
        const size = Math.abs(trend);
        if (this.samples < FIRST_SAMPLES) {
            this.signs[index] = 0;
            return;
        }
        const agitation = this.agitation[index] / this.agitationWeight;
        const threshold = Math.max(STEADY_PX_PER_SECOND, AGITATION_SHARE * Math.sqrt(agitation));
        const sign = trend > 0 ? 1 : -1;
        const shown = this.signs[index];
        if (shown === sign && size >= threshold * HOLD_SHARE) return;
        this.signs[index] = size >= threshold ? sign : 0;
    }
}

interface Filter {
    /** What is left of each filter over that time. */
    decay: number;
    /** What the first filter gives the second over that time. */
    carry: number;
}

function filterOver(seconds: number): Filter {
    const share = seconds / TREND_SECONDS;
    const decay = Math.exp(-share);
    return { decay, carry: share * decay };
}
