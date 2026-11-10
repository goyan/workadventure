#!/usr/bin/env python3
"""Generate the short "ouch" played when a Nerf dart takes a third of a heart.

Original synthetic sound, written for WorkAdventure Infogène (CC0): a voiced vowel whose pitch falls, shaped by two
formants, with a fast attack and decay. Deterministic: running it again rewrites the same file.

Usage: python3 play/scripts/generate-nerf-ouch.py
Writes play/public/resources/objects/nerf/ouch.wav (mono, 22 050 Hz, 16 bit, about 220 ms).
"""

import math
import struct
import wave
from pathlib import Path

RATE = 22050
DURATION = 0.22
PEAK = 10 ** (-3 / 20)  # -3 dBFS
# Vowel "ou" then "a": formant centres (Hz) and widths, moving over the sound.
FORMANTS_START = ((400, 120), (900, 160))
FORMANTS_END = ((750, 140), (1250, 200))


def formant_gain(frequency: float, centre: float, width: float) -> float:
    return 1.0 / (1.0 + ((frequency - centre) / width) ** 2)


def sample(t: float, phase: float) -> float:
    progress = t / DURATION
    formants = [
        (s[0] + (e[0] - s[0]) * progress, s[1] + (e[1] - s[1]) * progress)
        for s, e in zip(FORMANTS_START, FORMANTS_END)
    ]
    pitch = 420 - 200 * progress
    value = 0.0
    for harmonic in range(1, 16):
        frequency = pitch * harmonic
        gain = sum(formant_gain(frequency, centre, width) for centre, width in formants) / harmonic**0.5
        value += gain * math.sin(harmonic * phase)
    attack = min(1.0, t / 0.012)
    decay = math.exp(-((t / DURATION) ** 2) * 4.0)
    return value * attack * decay


def main() -> None:
    count = int(RATE * DURATION)
    phase = 0.0
    samples = []
    for i in range(count):
        t = i / RATE
        samples.append(sample(t, phase))
        phase += 2 * math.pi * (420 - 200 * t / DURATION) / RATE
    # Fade the last 10 ms to silence: no click at the end.
    fade = int(RATE * 0.01)
    for i in range(fade):
        samples[count - fade + i] *= 1 - i / fade
    scale = PEAK / max(abs(s) for s in samples)
    target = Path(__file__).resolve().parent.parent / "public" / "resources" / "objects" / "nerf" / "ouch.wav"
    with wave.open(str(target), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(struct.pack("<h", round(s * scale * 32767)) for s in samples))


if __name__ == "__main__":
    main()
