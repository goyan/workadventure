import type { LampBands } from "./LampSignal";

/** Magenta for the low notes, cyan for the high ones: the neon slides from one to the other with the music. */
export const NEON_BASS_COLOR = 0xff2bd6;
export const NEON_TREBLE_COLOR = 0x2be9ff;
/** A flash fades in this long: short enough to read as a flash, with the beat ceiling keeping flashes apart. */
export const FLASH_DURATION_MS = 140;
/** A lamp lights up quickly when its Jam starts to play. */
export const LAMP_FADE_IN_MS = 200;
/** And dies away slowly when the music stops: the light falls, it is not cut. */
export const LAMP_FADE_OUT_MS = 1500;
/** A spot never swings further than this from the vertical, in radians. */
const SPOT_MAX_ANGLE = 0.7;
/** Radians per millisecond of the swing at speed 1: one full sweep to and fro in about 4 seconds. */
const SPOT_RATE = (2 * Math.PI) / 4000;

function mixChannel(from: number, to: number, ratio: number): number {
    return Math.round(from + (to - from) * ratio);
}

export function neonColor(bands: LampBands): number {
    const total = bands.bass + bands.treble;
    const ratio = total === 0 ? 0 : bands.treble / total;
    const red = mixChannel((NEON_BASS_COLOR >> 16) & 0xff, (NEON_TREBLE_COLOR >> 16) & 0xff, ratio);
    const green = mixChannel((NEON_BASS_COLOR >> 8) & 0xff, (NEON_TREBLE_COLOR >> 8) & 0xff, ratio);
    const blue = mixChannel(NEON_BASS_COLOR & 0xff, NEON_TREBLE_COLOR & 0xff, ratio);
    return (red << 16) | (green << 8) | blue;
}

/** Angle of a swinging spot at `timeMs`: speed 1 is one sweep in 4 seconds, 0 is still. */
export function spotAngle(timeMs: number, speed: number): number {
    return SPOT_MAX_ANGLE * Math.sin(timeMs * SPOT_RATE * speed);
}

/** Brightness of a flash `sinceBeatMs` after the beat that lit it: 1 at once, 0 once over (undefined: no beat yet). */
export function flashAlpha(sinceBeatMs: number | undefined): number {
    if (sinceBeatMs === undefined || sinceBeatMs >= FLASH_DURATION_MS) {
        return 0;
    }
    return 1 - Math.max(0, sinceBeatMs) / FLASH_DURATION_MS;
}

/** How bright a lamp is after `deltaMs` more, going towards lit (1) or off (0): it picks up from where it was. */
export function nextBrightness(current: number, lit: boolean, deltaMs: number): number {
    if (deltaMs <= 0) {
        return current;
    }
    return lit ? Math.min(1, current + deltaMs / LAMP_FADE_IN_MS) : Math.max(0, current - deltaMs / LAMP_FADE_OUT_MS);
}
