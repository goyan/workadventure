import { z } from "zod";

const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";

export interface SpotifyTrack {
    title: string;
    artist: string;
    url: string;
    album?: string;
    /** Album cover on the Spotify image CDN. */
    artworkUrl?: string;
    /** Where it plays; Spotify when absent. */
    source?: "spotify" | "apple-music";
    /** Position in the track (ms) at `positionAt` (ms since the epoch), to listen along; absent when unknown. */
    positionMs?: number;
    positionAt?: number;
    /** The playlist or album it plays from (`spotify:playlist:<id>` / `spotify:album:<id>`) and its name. */
    contextUri?: string;
    contextName?: string;
}

/**
 * Only the fields we use. Episodes and ads come with `currently_playing_type` other than "track" (and no item
 * unless asked for): they are not shared.
 */
const CurrentlyPlayingResponse = z.object({
    is_playing: z.boolean(),
    progress_ms: z.number().nullable().optional(),
    currently_playing_type: z.string(),
    item: z
        .object({
            name: z.string(),
            artists: z.array(z.object({ name: z.string() })),
            external_urls: z.object({ spotify: z.string().optional() }),
            album: z
                .object({
                    name: z.string(),
                    images: z.array(z.object({ url: z.string(), width: z.number().nullable().optional() })),
                })
                .optional(),
        })
        .nullable(),
});

export type CurrentlyPlayingResult =
    | { status: "ok"; track: SpotifyTrack | undefined }
    | { status: "unauthorized" }
    | { status: "forbidden" }
    | { status: "rateLimited"; retryAfterMs: number };

export function parseCurrentlyPlaying(json: unknown, now = Date.now()): SpotifyTrack | undefined {
    const result = CurrentlyPlayingResponse.safeParse(json);
    if (!result.success) {
        return undefined;
    }
    const { is_playing, progress_ms, currently_playing_type, item } = result.data;
    if (!is_playing || currently_playing_type !== "track" || !item) {
        return undefined;
    }
    return {
        title: item.name,
        artist: item.artists.map((artist) => artist.name).join(", "),
        url: item.external_urls.spotify ?? "",
        album: item.album?.name,
        // Spotify lists the covers from the largest (640 px) down: the medium one (300 px) is enough for a card.
        artworkUrl: (item.album?.images[1] ?? item.album?.images[0])?.url,
        source: "spotify",
        ...(typeof progress_ms === "number" && { positionMs: progress_ms, positionAt: now }),
    };
}

export async function fetchCurrentlyPlaying(
    accessToken: string,
    fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<CurrentlyPlayingResult> {
    const response = await fetchFn(CURRENTLY_PLAYING_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) {
        return { status: "unauthorized" };
    }
    // A Spotify app in development mode lets anyone authorize it, then answers 403 to the users who are not
    // registered in its dashboard.
    if (response.status === 403) {
        return { status: "forbidden" };
    }
    if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After"));
        return {
            status: "rateLimited",
            retryAfterMs: (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 30) * 1000,
        };
    }
    // 204: nothing is playing.
    if (response.status === 204) {
        return { status: "ok", track: undefined };
    }
    if (!response.ok) {
        throw new Error(`Spotify currently-playing request failed (${response.status})`);
    }
    return { status: "ok", track: parseCurrentlyPlaying(await response.json()) };
}
