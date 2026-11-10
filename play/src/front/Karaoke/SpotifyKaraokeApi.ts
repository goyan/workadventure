import { z } from "zod";
import { LyricsTrackSchema } from "../../common/Lyrics";
import type { LyricsTrack } from "../../common/Lyrics";
import { SpotifyTrackItemSchema } from "../Spotify/SpotifyPlayerApi";

const Playback = z.object({
    is_playing: z.boolean(),
    progress_ms: z.number().nonnegative().nullable(),
    currently_playing_type: z.string(),
    item: SpotifyTrackItemSchema.nullable(),
});
const Queue = z.object({ queue: z.array(z.unknown()) });

function lyricsTrack(item: z.infer<typeof SpotifyTrackItemSchema>): LyricsTrack | undefined {
    const track = LyricsTrackSchema.safeParse({
        title: item.name,
        artist: item.artists.map((artist) => artist.name).join(", "),
        album: item.album?.name,
        durationMs: item.duration_ms,
    });
    return track.success ? track.data : undefined;
}

/** Tokens stay in the host's browser; only metadata are sent to the room. */
export async function fetchSpotifyKaraoke(
    token: string,
    endpoint: "currently-playing" | "queue",
    signal: AbortSignal,
    fetchFn: typeof fetch = fetch,
): Promise<Response> {
    return fetchFn(`https://api.spotify.com/v1/me/player/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    });
}

export function parseKaraokePlayback(json: unknown):
    | {
          track: LyricsTrack | null;
          playing: boolean;
          positionMs: number;
      }
    | undefined {
    const parsed = Playback.safeParse(json);
    if (!parsed.success) return undefined;
    const { item, currently_playing_type, is_playing, progress_ms } = parsed.data;
    const track = item && currently_playing_type === "track" ? lyricsTrack(item) : undefined;
    return { track: track ?? null, playing: is_playing && !!track, positionMs: progress_ms ?? 0 };
}

export function parseKaraokeQueue(json: unknown): LyricsTrack | undefined {
    const parsed = Queue.safeParse(json);
    const item = parsed.success ? SpotifyTrackItemSchema.safeParse(parsed.data.queue[0]) : undefined;
    return item?.success ? lyricsTrack(item.data) : undefined;
}
