import type { Unsubscriber } from "svelte/store";

export interface KaraokePitchFrame {
    midi: number | undefined;
    rms: number;
}

/** YIN difference and cumulative normalization reject noise instead of awarding it notes. */
export function detectKaraokePitch(samples: Float32Array, sampleRate: number): KaraokePitchFrame {
    if (samples.length < 1024 || !Number.isFinite(sampleRate) || sampleRate <= 0) return { midi: undefined, rms: 0 };
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    if (!Number.isFinite(rms) || rms < 0.012) return { midi: undefined, rms: Number.isFinite(rms) ? rms : 0 };
    const maxLag = Math.min(Math.floor(sampleRate / 65), Math.floor(samples.length / 2));
    const difference = new Float64Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag++) {
        let value = 0;
        for (let index = 0; index < samples.length - maxLag; index++) {
            const delta = samples[index] - samples[index + lag];
            value += delta * delta;
        }
        difference[lag] = value;
    }
    let sum = 0;
    for (let lag = 1; lag <= maxLag; lag++) {
        sum += difference[lag];
        difference[lag] = sum === 0 ? 1 : (difference[lag] * lag) / sum;
    }
    for (let lag = Math.max(2, Math.floor(sampleRate / 1200)); lag < maxLag; lag++) {
        if (difference[lag] >= 0.15) continue;
        while (lag + 1 < maxLag && difference[lag + 1] < difference[lag]) lag++;
        const before = difference[lag - 1],
            here = difference[lag],
            after = difference[lag + 1];
        const denominator = 2 * (2 * here - after - before);
        const refined = lag + (denominator === 0 ? 0 : (after - before) / denominator);
        return { midi: 69 + 12 * Math.log2(sampleRate / refined / 440), rms };
    }
    return { midi: undefined, rms };
}

/** This analyzer neither publishes nor plays the mic; its owner releases the media tracks. */
export async function watchKaraokePitch(
    stream: MediaStream,
    frame: (value: KaraokePitchFrame) => void,
): Promise<Unsubscriber> {
    const context = new AudioContext({ latencyHint: "interactive" });
    try {
        await context.resume();
        const source = context.createMediaStreamSource(stream);
        const analyzer = context.createAnalyser();
        analyzer.fftSize = 2048;
        source.connect(analyzer);
        const samples = new Float32Array(analyzer.fftSize);
        const timer = setInterval(() => {
            analyzer.getFloatTimeDomainData(samples);
            frame(detectKaraokePitch(samples, context.sampleRate));
        }, 50);
        return () => {
            clearInterval(timer);
            source.disconnect();
            analyzer.disconnect();
            context.close().catch(() => undefined);
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
