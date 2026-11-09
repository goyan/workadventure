import { audioContextManager } from "../../../WebRtc/AudioContextManager";
import { bandsOf, type LampBands } from "./LampSignal";

/** 512 bins: 47 Hz each at 48 kHz, fine enough to tell a kick (under 250 Hz) from a voice. */
const FFT_SIZE = 1024;
/** The analyser smooths a little between two readings: the lamps follow the music, not the noise. */
const SMOOTHING = 0.5;

/**
 * Listens to a stream (the music of a Jam) and tells, at each image, how loud its bass, mid and treble are. It only
 * looks: the analyser is connected to nothing, so the stream is not played a second time.
 */
export class StreamSpectrum {
    private analyser: AnalyserNode | undefined;
    private source: MediaStreamAudioSourceNode | undefined;
    private readonly bins: Uint8Array<ArrayBuffer>;
    private readonly sampleRate: number;

    constructor(stream: MediaStream, context: AudioContext = audioContextManager.getContext()) {
        this.sampleRate = context.sampleRate;
        this.bins = new Uint8Array(FFT_SIZE / 2);
        try {
            const analyser = context.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = SMOOTHING;
            const source = context.createMediaStreamSource(stream);
            source.connect(analyser);
            this.analyser = analyser;
            this.source = source;
        } catch (error) {
            // A stream without an audio track, or a context that is gone: the lamps stay lit, not moving.
            console.warn("Cannot analyse the music of the Jam", error);
        }
    }

    public read(): LampBands {
        if (!this.analyser) {
            return { bass: 0, mid: 0, treble: 0 };
        }
        this.analyser.getByteFrequencyData(this.bins);
        return bandsOf(this.bins, this.sampleRate);
    }

    public destroy(): void {
        this.source?.disconnect();
        this.analyser?.disconnect();
        this.source = undefined;
        this.analyser = undefined;
    }
}
