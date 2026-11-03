import { z } from "zod";
import type { SpotifyTrack } from "./SpotifyPlayerApi";

/**
 * A Spotify player read on this computer rather than through the Web API: the desktop app asks the Spotify app
 * what it plays. No account to link, no developer app, no Premium: any Spotify account works.
 */
export interface LocalSpotifyPlayer {
    /** Reads the player until the returned function is called; `onTrack` gets every change (undefined: nothing plays). */
    watch(onTrack: (track: SpotifyTrack | undefined) => void): () => void;
}

/** What the desktop app sends is validated: it is another program's output. */
const DesktopSpotifyTrack = z
    .object({
        title: z.string().min(1),
        artist: z.string(),
        url: z.string().refine((url) => url === "" || url.startsWith("https://open.spotify.com/"), {
            message: "Not a Spotify link",
        }),
    })
    .nullable();

/** The Spotify app of this computer, through the desktop app; undefined in a browser or an older desktop app. */
export function desktopSpotifyPlayer(): LocalSpotifyPlayer | undefined {
    const watchSpotifyTrack = window.WAD?.watchSpotifyTrack;
    if (!watchSpotifyTrack) return undefined;
    return {
        watch: (onTrack) =>
            watchSpotifyTrack((track) => {
                const parsed = DesktopSpotifyTrack.safeParse(track);
                if (!parsed.success) {
                    console.warn("Ignoring an invalid track from the desktop app", parsed.error.issues);
                    return;
                }
                onTrack(parsed.data ?? undefined);
            }),
    };
}
