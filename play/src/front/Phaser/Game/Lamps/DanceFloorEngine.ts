import {
    DANCE_FLOOR_COLOURS,
    DANCE_FLOOR_PATTERNS,
    floorHash,
    type FloorGrid,
    type FloorPattern,
} from "./DanceFloorPatterns";
import { LAMP_MIN_FLASH_INTERVAL_MS } from "./LampSignal";
import { mixColor } from "./LampStyle";

/** What the floor reads of the music of its Jam at each image. */
export interface DanceFloorMusic {
    beat: boolean;
    bass: number;
}

export interface DanceFloorInput {
    /**
     * The time of the clock, in milliseconds. Without music the pattern comes from it alone: every player sees the
     * same floor at the same time.
     */
    now: number;
    /** The music of the Jam the floor follows; undefined when none plays. */
    music: DanceFloorMusic | undefined;
    /** Photosensitivity: a slow floor, without a flash; the beats are ignored. */
    reducedMotion: boolean;
}

/** Without music a pattern moves one step in this long. */
const IDLE_STEP_MS = 600;
/** With motion reduced: four times slower. */
const REDUCED_STEP_MS = 2400;
/** Without music a pattern lasts between 10 and 20 seconds. */
const MIN_PATTERN_MS = 10_000;
const MAX_PATTERN_MS = 20_000;
/** The next pattern comes in over the last moments of the one that ends. */
const IDLE_TRANSITION_MS = 1500;
/** On music the pattern changes every 16 beats: four bars of most dance music. */
export const DANCE_FLOOR_BEATS_PER_PATTERN = 16;
const MUSIC_TRANSITION_MS = 600;
/** A passage without a beat this long: the floor moves on by itself, as it does without music. */
const NO_BEAT_MS = 1500;
/** How fast a tile lights up and goes out, in milliseconds. */
const ATTACK_MS = 90;
const RELEASE_MS = 380;
const REDUCED_FADE_MS = 1200;
const COLOUR_FADE_MS = 200;
/** A step taken on a beat is shown over this long: the pattern slides, it does not jump. */
const STEP_EASE_MS = 110;
const PULSE_DECAY_MS = 220;
/** A tile counts as lit from this level: what the flash ceiling is kept on. */
const LIT_LEVEL = 0.5;
/** Under this a tile is dark: it takes its next colour at once instead of sliding to it. */
const DARK_LEVEL = 0.08;

const IDLE_GLOW = 0.85;
const REDUCED_GLOW = 0.8;
const MUSIC_GLOW = 0.68;
const MUSIC_BASS_GLOW = 0.1;
const MUSIC_BEAT_GLOW = 0.27;
const GLOW_FOLLOW_MS = 300;

/** The floor at rest: night blue, nearly black, each tile a shade of its own. */
const REST_COLOUR = 0x070a1f;
const REST_TINT = 0x241a66;

export interface IdleSlot {
    /** Index of the pattern in DANCE_FLOOR_PATTERNS. */
    pattern: number;
    durationMs: number;
}

/**
 * The patterns a floor goes through without music, in an order and with lengths of its own (from its seed): every
 * pattern once, each for 10 to 20 seconds, then again.
 */
export function idleSchedule(seed: number): IdleSlot[] {
    const order = DANCE_FLOOR_PATTERNS.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
        const other = floorHash(seed, index, 29) % (index + 1);
        [order[index], order[other]] = [order[other], order[index]];
    }
    return order.map((pattern, index) => ({
        pattern,
        durationMs: MIN_PATTERN_MS + (floorHash(seed, index, 31) % (MAX_PATTERN_MS - MIN_PATTERN_MS + 1)),
    }));
}

export interface IdlePattern {
    pattern: number;
    /** The pattern that follows, and how far it has come in (0: not yet, 1: it is the only one left). */
    next: number;
    blend: number;
}

function slotAt(schedule: readonly IdleSlot[], now: number): IdlePattern {
    const cycle = schedule.reduce((sum, slot) => sum + slot.durationMs, 0);
    let time = ((now % cycle) + cycle) % cycle;
    for (let index = 0; index < schedule.length; index++) {
        const slot = schedule[index];
        if (time < slot.durationMs) {
            const left = slot.durationMs - time;
            return {
                pattern: slot.pattern,
                next: schedule[(index + 1) % schedule.length].pattern,
                blend: left >= IDLE_TRANSITION_MS ? 0 : 1 - left / IDLE_TRANSITION_MS,
            };
        }
        time -= slot.durationMs;
    }
    return { pattern: schedule[0].pattern, next: schedule[0].pattern, blend: 0 };
}

/** The pattern a floor shows without music at this time of the clock. */
export function idlePatternAt(seed: number, now: number): IdlePattern {
    return slotAt(idleSchedule(seed), now);
}

/**
 * The tiles of a dance floor, image after image: how lit each one is and in which colour. Nothing of Phaser here.
 *
 * Without music the floor goes through its patterns along the clock. On the music of a Jam each beat moves the
 * pattern one step and makes the floor glow, and the pattern changes every 16 beats.
 *
 * Photosensitivity (WCAG 2.3.1) is kept here, whatever the patterns and the music do: a tile lights up at most three
 * times a second, a beat is taken at most three times a second, and every change is a fade.
 */
export class DanceFloorEngine {
    /** How lit each tile is, from 0 to 1, row after row. */
    public readonly levels: Float32Array;
    private readonly red: Float32Array;
    private readonly green: Float32Array;
    private readonly blue: Float32Array;
    private readonly lit: Uint8Array;
    private readonly lastLitAt: Float64Array;
    private readonly restColours: Uint32Array;
    private readonly schedule: IdleSlot[];

    private lastNow: number | undefined;
    private current: FloorPattern = DANCE_FLOOR_PATTERNS[0];
    private glowBase = IDLE_GLOW;
    private pulse = 0;
    private bass = 0;
    private reduced = false;

    // On music.
    private playing = false;
    private beats = 0;
    private stepTarget = 0;
    private stepShown = 0;
    private lastBeatAt: number | undefined;
    private musicStartedAt = 0;
    private musicPattern = 0;
    private previousMusicPattern = 0;
    private musicPatternSince = -Infinity;

    constructor(
        private readonly grid: FloorGrid,
        private readonly seed: number,
    ) {
        const tiles = grid.cols * grid.rows;
        this.levels = new Float32Array(tiles);
        this.red = new Float32Array(tiles);
        this.green = new Float32Array(tiles);
        this.blue = new Float32Array(tiles);
        this.lit = new Uint8Array(tiles);
        this.lastLitAt = new Float64Array(tiles).fill(-Infinity);
        this.restColours = new Uint32Array(tiles);
        for (let tile = 0; tile < tiles; tile++) {
            this.restColours[tile] = mixColor(REST_COLOUR, REST_TINT, (floorHash(tile, seed, 41) % 100) / 280);
        }
        this.schedule = idleSchedule(seed);
    }

    /** The steps the pattern has taken since the music began: one per beat. */
    public get step(): number {
        return Math.floor(this.stepTarget + 1e-9);
    }

    /** The pattern being shown (the one that ends, during a transition). */
    public get patternName(): string {
        return this.current.name;
    }

    /** How bright the lit tiles are, from 0 to 1: steady without music, a kick on each beat. */
    public get glow(): number {
        return Math.min(1, this.glowBase + (this.reduced ? 0 : MUSIC_BEAT_GLOW * this.pulse));
    }

    public update(input: DanceFloorInput): void {
        const { now, reducedMotion } = input;
        const delta = this.lastNow === undefined ? 0 : Math.min(100, Math.max(0, now - this.lastNow));
        this.lastNow = now;
        this.reduced = reducedMotion;
        const music = reducedMotion ? undefined : input.music;

        let first: FloorPattern;
        let second: FloorPattern;
        let blend: number;
        let phase: number;
        if (music) {
            this.followMusic(music, now, delta);
            first = DANCE_FLOOR_PATTERNS[this.schedule[this.previousMusicPattern % this.schedule.length].pattern];
            second = DANCE_FLOOR_PATTERNS[this.schedule[this.musicPattern % this.schedule.length].pattern];
            blend = Math.min(1, (now - this.musicPatternSince) / MUSIC_TRANSITION_MS);
            phase = this.stepShown;
            this.current = second;
        } else {
            this.playing = false;
            this.pulse = 0;
            this.bass = 0;
            const idle = slotAt(this.schedule, now);
            first = DANCE_FLOOR_PATTERNS[idle.pattern];
            second = DANCE_FLOOR_PATTERNS[idle.next];
            blend = idle.blend;
            phase = now / (reducedMotion ? REDUCED_STEP_MS : IDLE_STEP_MS);
            this.current = first;
        }

        if (reducedMotion) {
            this.glowBase = REDUCED_GLOW;
        } else {
            const target = music ? MUSIC_GLOW + MUSIC_BASS_GLOW * this.bass : IDLE_GLOW;
            this.glowBase += (target - this.glowBase) * (1 - Math.exp(-delta / GLOW_FOLLOW_MS));
        }

        // The pattern that ends stays whole while the next one comes in, then goes out: the floor is never dark between.
        const firstWeight = Math.min(1, 2 * (1 - blend));
        const secondWeight = Math.min(1, 2 * blend);
        const rise = 1 - Math.exp(-delta / (reducedMotion ? REDUCED_FADE_MS : ATTACK_MS));
        const fall = 1 - Math.exp(-delta / (reducedMotion ? REDUCED_FADE_MS : RELEASE_MS));
        const slide = 1 - Math.exp(-delta / (reducedMotion ? REDUCED_FADE_MS : COLOUR_FADE_MS));
        const { cols, rows } = this.grid;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tile = row * cols + col;
                let wanted = firstWeight > 0 ? first.at(col, row, this.grid, phase) : undefined;
                let level = wanted ? wanted.level * firstWeight : 0;
                if (secondWeight > 0) {
                    const other = second.at(col, row, this.grid, phase);
                    if (other.level * secondWeight > level || !wanted) {
                        level = other.level * secondWeight;
                        wanted = other;
                    }
                }

                // The flash ceiling: a tile that went out waits before it lights up again.
                if (level >= LIT_LEVEL) {
                    if (!this.lit[tile]) {
                        if (now - this.lastLitAt[tile] >= LAMP_MIN_FLASH_INTERVAL_MS) {
                            this.lit[tile] = 1;
                            this.lastLitAt[tile] = now;
                        } else {
                            level = 0;
                        }
                    }
                } else {
                    this.lit[tile] = 0;
                }

                const shown = this.levels[tile];
                this.levels[tile] = shown + (level - shown) * (level > shown ? rise : fall);

                const colour = DANCE_FLOOR_COLOURS[wanted?.colour ?? 0];
                if (level > 0) {
                    const ratio = shown < DARK_LEVEL ? 1 : slide;
                    this.red[tile] += (((colour >> 16) & 0xff) - this.red[tile]) * ratio;
                    this.green[tile] += (((colour >> 8) & 0xff) - this.green[tile]) * ratio;
                    this.blue[tile] += ((colour & 0xff) - this.blue[tile]) * ratio;
                }
            }
        }
    }

    private followMusic(music: DanceFloorMusic, now: number, delta: number): void {
        if (!this.playing) {
            this.playing = true;
            this.beats = 0;
            this.stepTarget = 0;
            this.stepShown = 0;
            this.lastBeatAt = undefined;
            this.musicStartedAt = now;
            this.musicPattern = 0;
            this.previousMusicPattern = 0;
            this.musicPatternSince = -Infinity;
        }
        this.pulse *= Math.exp(-delta / PULSE_DECAY_MS);
        this.bass += (music.bass - this.bass) * (1 - Math.exp(-delta / (music.bass > this.bass ? 80 : 420)));
        // The flash ceiling again: whatever the source says, a beat is taken at most three times a second.
        const allowed = this.lastBeatAt === undefined || now - this.lastBeatAt >= LAMP_MIN_FLASH_INTERVAL_MS;
        if (music.beat && allowed) {
            this.lastBeatAt = now;
            this.beats++;
            this.stepTarget = Math.floor(this.stepTarget + 1e-9) + 1;
            this.pulse = 1;
            const pattern = Math.floor(this.beats / DANCE_FLOOR_BEATS_PER_PATTERN);
            if (pattern !== this.musicPattern) {
                this.previousMusicPattern = this.musicPattern;
                this.musicPattern = pattern;
                this.musicPatternSince = now;
            }
        } else if (now - (this.lastBeatAt ?? this.musicStartedAt) >= NO_BEAT_MS) {
            this.stepTarget += delta / IDLE_STEP_MS;
        }
        this.stepShown += (this.stepTarget - this.stepShown) * (1 - Math.exp(-delta / STEP_EASE_MS));
    }

    /**
     * Writes the floor, one pixel (RGBA) per tile: `tiles` is the floor itself, opaque; `halo` is the light alone,
     * black where nothing is lit, to be added over the floor as a soft glow.
     */
    public paint(tiles: Uint8ClampedArray, halo: Uint8ClampedArray): void {
        const glow = this.glow;
        for (let tile = 0; tile < this.levels.length; tile++) {
            const light = this.levels[tile] * glow;
            const rest = this.restColours[tile];
            const offset = tile * 4;
            // A fully lit tile burns a little towards white, as a lamp does.
            const white = 0.14 * light * light;
            const channel = (restValue: number, colourValue: number): number => {
                const lit = restValue + (colourValue - restValue) * light;
                return lit + (255 - lit) * white;
            };
            tiles[offset] = channel((rest >> 16) & 0xff, this.red[tile]);
            tiles[offset + 1] = channel((rest >> 8) & 0xff, this.green[tile]);
            tiles[offset + 2] = channel(rest & 0xff, this.blue[tile]);
            tiles[offset + 3] = 255;
            halo[offset] = this.red[tile] * light;
            halo[offset + 1] = this.green[tile] * light;
            halo[offset + 2] = this.blue[tile] * light;
            halo[offset + 3] = 255;
        }
    }
}
