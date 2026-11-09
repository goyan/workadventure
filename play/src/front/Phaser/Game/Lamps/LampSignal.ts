/**
 * Photosensitivity ceiling: a flash may follow no more than three beats a second (WCAG 2.3.1). Rounded up from
 * 1000 / 3 so that three flashes always span more than 600 ms: a fourth cannot fit in any second.
 */
export const LAMP_MIN_FLASH_INTERVAL_MS = 334;

/** The loudness of the music in three bands, each between 0 and 1. */
export interface LampBands {
    bass: number;
    mid: number;
    treble: number;
}

/** What the lamps read at each image: the bands, and whether a beat just came (never above the flash ceiling). */
export interface LampFrame extends LampBands {
    beat: boolean;
}

/** Where the lamps read the music: a spectrum analysed from the Jam, or a synthetic one to try the visuals out. */
export interface LampSignalSource {
    read(now: number): LampFrame;
}

function meanOf(spectrum: Uint8Array, from: number, to: number): number {
    if (to <= from) {
        return 0;
    }
    let sum = 0;
    for (let index = from; index < to; index++) {
        sum += spectrum[index];
    }
    return sum / (to - from) / 255;
}

/** A kick drum and a bass guitar live under this; a voice and most instruments between this and the next. */
const BASS_MAX_HZ = 250;
const MID_MAX_HZ = 4000;

/**
 * Bass, mid and treble of a spectrum. With the sample rate, the bands are cut at 250 Hz and 4 kHz (a spectrum of N
 * bins runs from 0 to half the sample rate): what a kick, a voice and a hi-hat each light up. Without it, the
 * spectrum is cut in fractions: bass is its first eighth, treble its upper half.
 */
export function bandsOf(spectrum: Uint8Array, sampleRate?: number): LampBands {
    let bassEnd = Math.floor(spectrum.length / 8);
    let midEnd = Math.floor(spectrum.length / 2);
    if (sampleRate !== undefined && sampleRate > 0 && spectrum.length > 0) {
        const binHz = sampleRate / (2 * spectrum.length);
        bassEnd = Math.min(spectrum.length, Math.ceil(BASS_MAX_HZ / binHz));
        midEnd = Math.min(spectrum.length, Math.ceil(MID_MAX_HZ / binHz));
    }
    return {
        bass: meanOf(spectrum, 0, bassEnd),
        mid: meanOf(spectrum, bassEnd, midEnd),
        treble: meanOf(spectrum, midEnd, spectrum.length),
    };
}

/** A beat is a loudness well above the recent average; the average follows the music over about a second. */
const AVERAGE_TIME_MS = 800;
const RISE_RATIO = 1.3;
const RISE_FLOOR = 0.05;
/** The average needs this long to mean something: nothing fires before. */
const WARM_UP_MS = 400;

/**
 * Finds the beats of a loudness that arrives image after image. Whatever the music, two beats are never closer than
 * LAMP_MIN_FLASH_INTERVAL_MS: this is where the flash ceiling is kept, so that no lamp can be made to flash faster.
 */
export class BeatDetector {
    private average = 0;
    private lastTime: number | undefined;
    private startedAt: number | undefined;
    private lastBeatAt: number | undefined;

    public update(now: number, energy: number): boolean {
        if (this.startedAt === undefined || this.lastTime === undefined) {
            this.startedAt = now;
        } else {
            const smoothing = 1 - Math.exp(-(now - this.lastTime) / AVERAGE_TIME_MS);
            this.average += (energy - this.average) * smoothing;
        }
        this.lastTime = now;

        const warm = now - this.startedAt >= WARM_UP_MS;
        const rising = energy > this.average * RISE_RATIO + RISE_FLOOR;
        const allowed = this.lastBeatAt === undefined || now - this.lastBeatAt >= LAMP_MIN_FLASH_INTERVAL_MS;
        if (warm && rising && allowed) {
            this.lastBeatAt = now;
            return true;
        }
        return false;
    }

    public reset(): void {
        this.average = 0;
        this.lastTime = undefined;
        this.startedAt = undefined;
        this.lastBeatAt = undefined;
    }
}

/**
 * A signal source made of a spectrum read at each image: the bands go straight out, and the beat is found on the
 * bass, which is what a kick lights up. The flash ceiling is the detector's.
 */
export class SpectrumSignalSource implements LampSignalSource {
    private readonly detector = new BeatDetector();

    constructor(private readonly spectrumAt: (now: number) => LampBands) {}

    public read(now: number): LampFrame {
        const bands = this.spectrumAt(now);
        return { ...bands, beat: this.detector.update(now, bands.bass) };
    }
}
