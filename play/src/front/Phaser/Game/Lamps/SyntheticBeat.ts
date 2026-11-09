import type { LampBands } from "./LampSignal";

/** How fast each drum dies away, in milliseconds. */
const KICK_DECAY_MS = 90;
const SNARE_DECAY_MS = 70;
const HAT_DECAY_MS = 40;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/**
 * A made-up spectrum of a steady beat: a kick on every beat (bass), a snare on the half beats (mid), a hat every half
 * beat (treble). To look at the lamps without a Jam; nothing about it is random, the same time gives the same sound.
 */
export function syntheticSpectrum(timeMs: number, bpm: number): LampBands {
    const beatMs = 60_000 / bpm;
    const sinceBeat = ((timeMs % beatMs) + beatMs) % beatMs;
    const sinceOffBeat = (sinceBeat - beatMs / 2 + beatMs) % beatMs;
    const sinceHat = sinceBeat % (beatMs / 2);
    return {
        bass: clamp01(Math.exp(-sinceBeat / KICK_DECAY_MS)),
        mid: clamp01(0.7 * Math.exp(-sinceOffBeat / SNARE_DECAY_MS)),
        treble: clamp01(0.5 * Math.exp(-sinceHat / HAT_DECAY_MS)),
    };
}
