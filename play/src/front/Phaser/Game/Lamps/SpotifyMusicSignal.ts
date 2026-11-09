import { z } from "zod";
import type { DesktopSpotifyMusicFrame } from "../../../Interfaces/DesktopAppInterfaces";
import { LAMP_MIN_FLASH_INTERVAL_MS, type LampFrame } from "./LampSignal";

const unit = z.number().min(0).max(1);
const frameSchema = z
    .object({
        uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
        beatStartMs: z.number().int().nonnegative(),
        intensity: unit,
        attack: unit.optional(),
        brightness: unit.optional(),
        barStartMs: z.number().int().nonnegative().optional(),
    })
    .nullable();
const IDLE: LampFrame = { bass: 0, mid: 0, treble: 0, beat: false };
const STALE_MS = 1000;
/** A kick lights the room at once and dies away this fast: a punch, not a glow. */
const KICK_DECAY_MS = 180;
/** What the loudness alone gives the bass between two kicks: the room never goes still while the music plays. */
const BASS_FLOOR = 0.3;

/**
 * Spotify's analysis read as a light show: beats and bars where Spotify placed them, the bass as a punch on each beat
 * (as strong as the attack of the sound under it: a kick hits harder than a chord), the treble from how bright the
 * sound is. Spotify gives no live spectrum: nothing here is made up from the audio.
 */
export class SpotifyMusicSignal {
    private frame: DesktopSpotifyMusicFrame | null = null;
    private receivedAt = 0;
    private lastBeat: string | undefined;
    private lastBar: string | undefined;
    private lastFlashAt = -Infinity;
    private kick = { at: -Infinity, strength: 0 };

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
        const beatKey = `${frame.uri}:${frame.beatStartMs}`;
        const beat = beatKey !== this.lastBeat && now - this.lastFlashAt >= LAMP_MIN_FLASH_INTERVAL_MS;
        this.lastBeat = beatKey;
        const barKey = frame.barStartMs === undefined ? undefined : `${frame.uri}:${frame.barStartMs}`;
        // A bar opens on a beat: its bigger change is held to the same flash ceiling.
        const bar = beat && barKey !== undefined && barKey !== this.lastBar;
        if (beat) {
            this.lastFlashAt = now;
            this.kick = { at: now, strength: Math.max(frame.attack ?? frame.intensity, 0.35) };
            if (barKey !== undefined) this.lastBar = barKey;
        }
        const punch = this.kick.strength * Math.exp(-(now - this.kick.at) / KICK_DECAY_MS);
        return {
            bass: Math.min(1, BASS_FLOOR * frame.intensity + (1 - BASS_FLOOR) * punch),
            mid: frame.intensity,
            treble: frame.intensity * (frame.brightness ?? 1),
            beat,
            ...(bar && { bar }),
        };
    }
}
