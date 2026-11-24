import { describe, expect, it, vi } from "vitest";
import { createStreamSilenceMeter } from "../../../src/front/ListeningZone/StreamSilenceMeter";

function fakeContext(state: AudioContextState, peak: number) {
    const analyser = {
        fftSize: 0,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: vi.fn((samples: Float32Array) => {
            samples.fill(0);
            samples[10] = peak;
        }),
    };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const context = {
        state,
        createAnalyser: () => analyser,
        createMediaStreamSource: () => source,
    } as unknown as AudioContext;
    return { context, analyser, source };
}

const stream = {} as MediaStream;

describe("StreamSilenceMeter", () => {
    it("tells a dead silence from a quiet passage by its peak", () => {
        expect(createStreamSilenceMeter(stream, fakeContext("running", 0).context).isSilent()).toBe(true);
        expect(createStreamSilenceMeter(stream, fakeContext("running", 1e-5).context).isSilent()).toBe(true);
        expect(createStreamSilenceMeter(stream, fakeContext("running", 1e-3).context).isSilent()).toBe(false);
        expect(createStreamSilenceMeter(stream, fakeContext("running", -0.2).context).isSilent()).toBe(false);
    });

    it("never calls silence what a suspended audio context reads", () => {
        expect(createStreamSilenceMeter(stream, fakeContext("suspended", 0).context).isSilent()).toBe(false);
        expect(createStreamSilenceMeter(stream, fakeContext("closed", 0).context).isSilent()).toBe(false);
    });

    it("lets go of its nodes, and nothing else, when destroyed", () => {
        const { context, analyser, source } = fakeContext("running", 0);
        const meter = createStreamSilenceMeter(stream, context);
        meter.destroy();
        expect(source.disconnect).toHaveBeenCalled();
        expect(analyser.disconnect).toHaveBeenCalled();
        expect(meter.isSilent()).toBe(false);
    });

    it("says nothing about a stream it cannot read", () => {
        const context = {
            state: "running",
            createAnalyser: () => {
                throw new Error("gone");
            },
        } as unknown as AudioContext;
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        expect(createStreamSilenceMeter(stream, context).isSilent()).toBe(false);
    });
});
