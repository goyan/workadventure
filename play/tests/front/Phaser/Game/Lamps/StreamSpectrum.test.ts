import { describe, expect, it, vi } from "vitest";
import { StreamSpectrum } from "../../../../../src/front/Phaser/Game/Lamps/StreamSpectrum";

function fakeAudio(spectrum: Uint8Array, sampleRate = 48_000) {
    const analyser = {
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: spectrum.length,
        getByteFrequencyData: vi.fn((into: Uint8Array) => into.set(spectrum)),
        disconnect: vi.fn(),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
        sampleRate,
        createAnalyser: vi.fn(() => analyser),
        createMediaStreamSource: vi.fn(() => source),
    };
    return { analyser, source, context: context as unknown as AudioContext };
}

const stream = {} as MediaStream;

describe("StreamSpectrum", () => {
    it("listens to the stream through an analyser, and plays nothing: the music is already played by the player", () => {
        const { context, source, analyser } = fakeAudio(new Uint8Array(512));
        new StreamSpectrum(stream, context);
        expect(
            (context as unknown as { createMediaStreamSource: unknown }).createMediaStreamSource,
        ).toHaveBeenCalledWith(stream);
        expect(source.connect).toHaveBeenCalledTimes(1);
        expect(source.connect).toHaveBeenCalledWith(analyser);
    });

    it("asks for 512 bins: 47 Hz each at 48 kHz, fine enough to tell a kick from a voice", () => {
        const { context, analyser } = fakeAudio(new Uint8Array(512));
        new StreamSpectrum(stream, context);
        expect(analyser.fftSize).toBe(1024);
    });

    it("reads the bands of what the analyser hears, cut at 250 Hz and 4 kHz", () => {
        const spectrum = new Uint8Array(512);
        spectrum.fill(255, 0, 6);
        const { context } = fakeAudio(spectrum);
        expect(new StreamSpectrum(stream, context).read()).toEqual({ bass: 1, mid: 0, treble: 0 });
    });

    it("cuts the bands for the sample rate of the context", () => {
        const spectrum = new Uint8Array(512);
        spectrum[90] = 255;
        expect(new StreamSpectrum(stream, fakeAudio(spectrum, 44_100).context).read().mid).toBeGreaterThan(0);
        expect(new StreamSpectrum(stream, fakeAudio(spectrum, 48_000).context).read().treble).toBeGreaterThan(0);
    });

    it("lets go of the stream when it is done", () => {
        const { context, source, analyser } = fakeAudio(new Uint8Array(512));
        const spectrum = new StreamSpectrum(stream, context);
        spectrum.destroy();
        expect(source.disconnect).toHaveBeenCalledTimes(1);
        expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    });

    it("is silent once destroyed", () => {
        const spectrum = new Uint8Array(512);
        spectrum.fill(255);
        const { context } = fakeAudio(spectrum);
        const analysed = new StreamSpectrum(stream, context);
        analysed.destroy();
        expect(analysed.read()).toEqual({ bass: 0, mid: 0, treble: 0 });
    });

    it("stays silent, rather than failing, when the stream cannot be listened to", () => {
        const { context } = fakeAudio(new Uint8Array(512));
        (context as unknown as { createMediaStreamSource: () => never }).createMediaStreamSource = () => {
            throw new Error("no audio track");
        };
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        expect(new StreamSpectrum(stream, context).read()).toEqual({ bass: 0, mid: 0, treble: 0 });
    });
});
