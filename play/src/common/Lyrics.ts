import { z } from "zod";

/** The edition matters: a live recording and its studio version have different lyric timings. */
export const LyricsTrackSchema = z.object({
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
    album: z.string().trim().max(200).optional(),
    durationMs: z.number().finite().positive().max(86_400_000).optional(),
});
export type LyricsTrack = z.infer<typeof LyricsTrackSchema>;

export const LyricsResultSchema = z.discriminatedUnion("status", [
    z.object({
        status: z.literal("found"),
        plainLyrics: z.string().max(100_000),
        syncedLyrics: z.string().max(100_000),
        instrumental: z.boolean(),
        source: z.enum(["lrclib", "lyrics.ovh"]),
    }),
    z.object({ status: z.literal("missing") }),
]);
export type LyricsResult = z.infer<typeof LyricsResultSchema>;

/** Use the same key on the pusher and in the browser, including the recording's album and duration. */
export function lyricsTrackKey(track: LyricsTrack): string {
    return JSON.stringify([
        track.title.trim().toLowerCase(),
        track.artist.trim().toLowerCase(),
        track.album?.trim().toLowerCase() ?? "",
        track.durationMs === undefined ? null : Math.round(track.durationMs / 1000),
    ]);
}
