import { audioContextManager } from "../WebRtc/AudioContextManager";

/** What the capture asks of whatever listens to the shared music to tell whether it is dead silent. */
export interface SilenceMeter {
    /** True when nothing but digital silence reached the meter since the last reading. */
    isSilent(): boolean;
    destroy(): void;
}

/**
 * About -90 dBFS, on the last 2048 samples read once a second: a quiet passage is far above it, only an input that
 * delivers nothing is under it.
 */
const SILENCE_PEAK = 3e-5;
const FFT_SIZE = 2048;

/**
 * Measures the peak of a stream. The analyser is connected to nothing, so the stream is not played a second time, and
 * the shared audio context is left alone: only the nodes created here are released.
 */
export function createStreamSilenceMeter(
    stream: MediaStream,
    context: AudioContext = audioContextManager.getContext(),
): SilenceMeter {
    let source: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    const samples = new Float32Array(FFT_SIZE);
    try {
        analyser = context.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        source = context.createMediaStreamSource(stream);
        source.connect(analyser);
    } catch (error) {
        // No audio track, or a context that is gone: nothing can be said about the silence.
        console.warn("Cannot measure the silence of the shared music", error);
        analyser = undefined;
    }
    return {
        isSilent() {
            // A context the browser keeps suspended reads zeros whatever the music: that is not silence.
            if (!analyser || context.state !== "running") {
                return false;
            }
            analyser.getFloatTimeDomainData(samples);
            let peak = 0;
            for (const sample of samples) {
                peak = Math.max(peak, Math.abs(sample));
            }
            return peak < SILENCE_PEAK;
        },
        destroy() {
            source?.disconnect();
            analyser?.disconnect();
            source = undefined;
            analyser = undefined;
        },
    };
}
