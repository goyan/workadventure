import { describe, expect, it } from "vitest";
import {
    BeatDetector,
    bandsOf,
    LAMP_MIN_FLASH_INTERVAL_MS,
    SpectrumSignalSource,
} from "../../../../../src/front/Phaser/Game/Lamps/LampSignal";

describe("bandsOf", () => {
    it("splits the spectrum into bass, mid and treble, each between 0 and 1", () => {
        // 16 bins: bass is the first eighth (2 bins), treble the upper half (8 bins), mid what is between (6 bins).
        const spectrum = new Uint8Array(16);
        spectrum.fill(255, 0, 2);
        const bands = bandsOf(spectrum);
        expect(bands.bass).toBe(1);
        expect(bands.mid).toBe(0);
        expect(bands.treble).toBe(0);
    });

    it("reads the treble in the upper half", () => {
        const spectrum = new Uint8Array(16);
        spectrum.fill(255, 8, 16);
        expect(bandsOf(spectrum)).toEqual({ bass: 0, mid: 0, treble: 1 });
    });

    it("averages inside a band", () => {
        const spectrum = new Uint8Array(16);
        spectrum[0] = 255;
        expect(bandsOf(spectrum).bass).toBeCloseTo(0.5, 5);
    });

    it("is silent for an empty spectrum", () => {
        expect(bandsOf(new Uint8Array(0))).toEqual({ bass: 0, mid: 0, treble: 0 });
    });
});

describe("bandsOf with the sample rate", () => {
    // fftSize 1024 at 48 kHz: 512 bins of 46.875 Hz. Bass is below 250 Hz (bins 0 to 5), mid up to 4 kHz (bins 6 to 85),
    // treble above (bins 86 and more).
    const SAMPLE_RATE = 48_000;

    it("hears a kick drum, which lives under 250 Hz, as bass only", () => {
        const spectrum = new Uint8Array(512);
        spectrum.fill(255, 0, 6);
        expect(bandsOf(spectrum, SAMPLE_RATE)).toEqual({ bass: 1, mid: 0, treble: 0 });
    });

    it("hears a voice, between 250 Hz and 4 kHz, as mid only", () => {
        const spectrum = new Uint8Array(512);
        spectrum.fill(255, 6, 86);
        expect(bandsOf(spectrum, SAMPLE_RATE)).toEqual({ bass: 0, mid: 1, treble: 0 });
    });

    it("hears a hi-hat, above 4 kHz, as treble only", () => {
        const spectrum = new Uint8Array(512);
        spectrum.fill(255, 86, 512);
        expect(bandsOf(spectrum, SAMPLE_RATE)).toEqual({ bass: 0, mid: 0, treble: 1 });
    });

    it("follows the sample rate: the same bin is treble at 48 kHz and still mid at 44.1 kHz", () => {
        // Bin 90 is at 4219 Hz at 48 kHz, and at 3876 Hz at 44.1 kHz.
        const spectrum = new Uint8Array(512);
        spectrum[90] = 255;
        expect(bandsOf(spectrum, 48_000).treble).toBeGreaterThan(0);
        expect(bandsOf(spectrum, 48_000).mid).toBe(0);
        expect(bandsOf(spectrum, 44_100).mid).toBeGreaterThan(0);
        expect(bandsOf(spectrum, 44_100).treble).toBe(0);
    });
});

describe("BeatDetector", () => {
    // One step per frame at 60 images per second.
    const FRAME_MS = 1000 / 60;

    function run(energyAt: (timeMs: number) => number, durationMs: number, detector = new BeatDetector()): number[] {
        const beats: number[] = [];
        for (let time = 0; time <= durationMs; time += FRAME_MS) {
            if (detector.update(time, energyAt(time))) {
                beats.push(time);
            }
        }
        return beats;
    }

    // A kick every 500 ms (120 BPM): a short burst on a quiet floor.
    const kicks120 = (time: number): number => (time % 500 < 80 ? 0.9 : 0.1);

    it("finds the kicks of a steady 120 BPM beat, about twice a second", () => {
        const beats = run(kicks120, 10_000);
        // Warm-up aside, one beat per kick: 2 per second.
        const lastSeconds = beats.filter((time) => time >= 2000);
        expect(lastSeconds.length).toBeGreaterThanOrEqual(15);
        expect(lastSeconds.length).toBeLessThanOrEqual(17);
    });

    // What the analyser of the browser gives for a drum loop at 120 BPM over a steady bass line, measured in Chromium
    // (Web Audio, fftSize 1024, smoothing 0.5): the bass band sits around 0.68 between two kicks, within 0.02, and
    // reaches about 0.94 on a kick. Louder or quieter bass lines move the floor (0.68 to 0.75) and keep the kick near 0.94.
    const realBass = (time: number): number =>
        0.68 + 0.26 * Math.exp(-(time % 500) / 60) + 0.02 * Math.sin(time * 0.037);

    it("finds the kicks of music as the analyser of the browser gives it", () => {
        const beats = run(realBass, 10_000).filter((time) => time >= 2000);
        // 120 BPM: 2 a second, 16 kicks between 2 and 10 seconds (measured: every one is found).
        expect(beats.length).toBeGreaterThanOrEqual(15);
        expect(beats.length).toBeLessThanOrEqual(17);
    });

    it("finds nothing in a loud steady bass that only wobbles: no kick, no flash", () => {
        const wobble = (time: number): number => 0.7 + 0.03 * Math.sin(time * 0.037) + 0.02 * Math.sin(time * 0.011);
        expect(run(wobble, 10_000).filter((time) => time >= 2000)).toEqual([]);
    });

    it("finds nothing in a slow swell: the average follows a rise that takes seconds", () => {
        // From 0.5 to 0.9 in 8 seconds.
        const swell = (time: number): number => 0.5 + (0.4 * Math.min(time, 8000)) / 8000;
        expect(run(swell, 8000).filter((time) => time >= 2000)).toEqual([]);
    });

    it("finds nothing in silence", () => {
        expect(run(() => 0, 5000)).toEqual([]);
    });

    it("finds nothing in a steady loud sound: no change, no beat", () => {
        expect(run(() => 0.8, 5000).filter((time) => time >= 2000)).toEqual([]);
    });

    it("never fires more than three times a second, whatever the music: the photosensitivity ceiling", () => {
        // A kick every 100 ms (600 BPM): far above what a strobe may follow.
        const beats = run((time) => (time % 100 < 30 ? 0.95 : 0.05), 10_000);
        for (let index = 1; index < beats.length; index++) {
            expect(beats[index] - beats[index - 1]).toBeGreaterThanOrEqual(LAMP_MIN_FLASH_INTERVAL_MS - 1);
        }
        const inAnySecond = beats.filter((time) => time >= 3000 && time < 4000);
        expect(inAnySecond.length).toBeLessThanOrEqual(3);
    });

    it("keeps the ceiling at 3 flashes per second", () => {
        expect(LAMP_MIN_FLASH_INTERVAL_MS).toBe(334);
    });

    it("starts afresh after a long pause", () => {
        const detector = new BeatDetector();
        const first = run(kicks120, 3000, detector);
        expect(first.length).toBeGreaterThan(0);
        detector.reset();
        expect(detector.update(100_000, 0.9)).toBe(false);
    });
});

describe("SpectrumSignalSource", () => {
    it("hands out the bands of the spectrum and a beat on each kick, never above the flash ceiling", () => {
        const kick = (time: number) => ({ bass: time % 500 < 80 ? 0.9 : 0.1, mid: 0.2, treble: 0.3 });
        const source = new SpectrumSignalSource(kick);
        const beats: number[] = [];
        for (let time = 0; time <= 10_000; time += 1000 / 60) {
            const frame = source.read(time);
            expect(frame.mid).toBe(0.2);
            expect(frame.treble).toBe(0.3);
            if (frame.beat) beats.push(time);
        }
        expect(beats.filter((time) => time >= 2000).length).toBeGreaterThanOrEqual(15);
        for (let index = 1; index < beats.length; index++) {
            expect(beats[index] - beats[index - 1]).toBeGreaterThanOrEqual(LAMP_MIN_FLASH_INTERVAL_MS - 1);
        }
    });
});
