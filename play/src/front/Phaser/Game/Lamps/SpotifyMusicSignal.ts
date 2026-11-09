import { z } from "zod";
import type { DesktopSpotifyMusicFrame } from "../../../Interfaces/DesktopAppInterfaces";
import { LAMP_MIN_FLASH_INTERVAL_MS, type LampFrame } from "./LampSignal";

const frameSchema = z
    .object({
        uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
        beatStartMs: z.number().int().nonnegative(),
        intensity: z.number().min(0).max(1),
    })
    .nullable();
const IDLE: LampFrame = { bass: 0, mid: 0, treble: 0, beat: false };
const STALE_MS = 1000;

/** Actual Spotify beat times and loudness; its analysis provides no live frequency spectrum. */
export class SpotifyMusicSignal {
    private frame: DesktopSpotifyMusicFrame | null = null;
    private receivedAt = 0;
    private lastBeat: string | undefined;
    private lastFlashAt = -Infinity;

    public set(value: unknown, now: number): void {
        const parsed = frameSchema.safeParse(value);
        this.frame = parsed.success ? parsed.data : null;
        this.receivedAt = now;
    }

    public read(uri: string | undefined, now: number): LampFrame {
        const frame = this.frame;
        if (!frame || frame.uri !== uri || now - this.receivedAt > STALE_MS) {
            return IDLE;
        }
        const key = `${frame.uri}:${frame.beatStartMs}`;
        const beat = key !== this.lastBeat && now - this.lastFlashAt >= LAMP_MIN_FLASH_INTERVAL_MS;
        this.lastBeat = key;
        if (beat) this.lastFlashAt = now;
        return { bass: frame.intensity, mid: frame.intensity, treble: frame.intensity, beat };
    }
}
