import { z } from "zod";

const CURRENTLY_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";

export interface SpotifyTrack {
    title: string;
    artist: string;
    url: string;
}

/**
 * Only the fields we use. Episodes and ads come with `currently_playing_type` other than "track" (and no item
 * unless asked for): they are not shared.
 */
const CurrentlyPlayingResponse = z.object({
    is_playing: z.boolean(),
    currently_playing_type: z.string(),
    item: z
        .object({
            name: z.string(),
            artists: z.array(z.object({ name: z.string() })),
            external_urls: z.object({ spotify: z.string().optional() }),
        })
        .nullable(),
});

export type CurrentlyPlayingResult =
    | { status: "ok"; track: SpotifyTrack | undefined }
    | { status: "unauthorized" }
    | { status: "forbidden" }
    | { status: "rateLimited"; retryAfterMs: number };

export function parseCurrentlyPlaying(json: unknown): SpotifyTrack | undefined {
    const result = CurrentlyPlayingResponse.safeParse(json);
    if (!result.success) {
        return undefined;
    }
    const { is_playing, currently_playing_type, item } = result.data;
    if (!is_playing || currently_playing_type !== "track" || !item) {
        return undefined;
    }
    return {
        title: item.name,
        artist: item.artists.map((artist) => artist.name).join(", "),
        url: item.external_urls.spotify ?? "",
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
