import { describe, expect, it } from "vitest";
import { KaraokeScoring, appendReferenceNote, karaokePitchDistance } from "../../../src/front/Karaoke/KaraokeScoring";
import { detectKaraokePitch } from "../../../src/front/Karaoke/KaraokePitch";
import { parseUltraStar } from "../../../src/front/Karaoke/UltraStar";

const notes = [
    { startMs: 0, endMs: 1000, midi: 69, golden: false },
    { startMs: 1000, endMs: 2000, midi: 72, golden: true },
];
function tone(hz: number, amplitude = 0.2): Float32Array {
    return Float32Array.from({ length: 2048 }, (_, index) => amplitude * Math.sin((2 * Math.PI * hz * index) / 48_000));
}

describe("karaoke accuracy", () => {
    it.each([110, 220, 440, 659.255, 880])("detects a %i Hz singing note", (hz) => {
        expect(detectKaraokePitch(tone(hz), 48_000).midi).toBeCloseTo(69 + 12 * Math.log2(hz / 440), 1);
    });
    it("rejects silence, very quiet audio, invalid buffers and nonperiodic noise", () => {
        expect(detectKaraokePitch(new Float32Array(2048), 48_000).midi).toBeUndefined();
        expect(detectKaraokePitch(tone(440, 0.001), 48_000).midi).toBeUndefined();
        expect(detectKaraokePitch(new Float32Array(0), 48_000).rms).toBe(0);
        expect(detectKaraokePitch(tone(440), 0).midi).toBeUndefined();
        let seed = 12;
        const noise = Float32Array.from({ length: 2048 }, () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0xffffffff - 0.5;
        });
        expect(detectKaraokePitch(noise, 48_000).midi).toBeUndefined();
    });
    it("awards 10,000 for the melody including a different vocal octave", () => {
        const scorer = new KaraokeScoring(notes);
        for (let at = 0; at < 2000; at += 50) scorer.sample(at, at < 1000 ? 57 : 84);
        expect(scorer.result()).toEqual({ score: 10000, accuracy: 100, coverage: 100, combo: 2 });
    });
    it("counts silence and golden notes, and never rewards a replay of a time cell", () => {
        const scorer = new KaraokeScoring(notes);
        for (let at = 0; at < 2000; at += 50) scorer.sample(at, at < 1000 ? 69 : undefined);
        expect(scorer.result()).toEqual({ score: 3333, accuracy: 33, coverage: 100, combo: 1 });
        for (let at = 1000; at < 2000; at += 50) scorer.sample(at, 72);
        expect(scorer.result().score).toBe(3333);
    });
    it("distinguishes loud wrong notes from an on-pitch voice, without hiding partial coverage", () => {
        const scorer = new KaraokeScoring(notes);
        const pitch = detectKaraokePitch(tone(440, 0.8), 48_000).midi;
        for (let at = 0; at < 1000; at += 50) scorer.sample(at, pitch);
        expect(scorer.result()).toMatchObject({ accuracy: 100, score: 3333, coverage: 33 });
        scorer.sample(1000, 78);
        expect(scorer.result().accuracy).toBeLessThan(100);
        expect(karaokePitchDistance(57, 69)).toBe(0);
    });
    it("runs a complete imported chart through audio detection and scoring", () => {
        const chart = parseUltraStar(
            "#TITLE:Exercise\n#ARTIST:WA\n#BPM:120\n#GAP:0\n: 0 4 9 La\n* 4 4 12 la\nE",
            "exercise",
        );
        const scorer = new KaraokeScoring(chart.notes);
        for (let at = 0; at < 1000; at += 50) {
            const frame = detectKaraokePitch(tone(at < 500 ? 440 : 523.251), 48_000);
            scorer.sample(at, frame.midi);
        }
        expect(scorer.result()).toMatchObject({ score: 10000, accuracy: 100, coverage: 100, combo: 2 });
    });
    it("stores reference notes without audio, merging held notes and refusing backwards/invalid frames", () => {
        let recorded = appendReferenceNote([], 100, 69.1);
        recorded = appendReferenceNote(recorded, 150, 69.2);
        expect(recorded).toEqual([{ startMs: 100, endMs: 200, midi: 69, golden: false }]);
        expect(appendReferenceNote(recorded, 100, 70)).toEqual(recorded);
        expect(appendReferenceNote(recorded, 250, undefined)).toEqual(recorded);
        expect(appendReferenceNote(recorded, 250, Number.NaN)).toEqual(recorded);
        expect(appendReferenceNote(recorded, 250, 200)).toEqual(recorded);
        expect(appendReferenceNote(recorded, 250, 72).at(-1)).toMatchObject({ startMs: 250, endMs: 300, midi: 72 });
    });
});
