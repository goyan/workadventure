import { readable } from "svelte/store";
import type { Readable, Unsubscriber } from "svelte/store";
import type { SpotifyPlaybackState, WorkAdventureDesktopApi } from "../Interfaces/DesktopAppInterfaces";

type DesktopPlayback = Pick<WorkAdventureDesktopApi, "watchSpotifyPlayback">;
const playbackByDesktop = new WeakMap<DesktopPlayback, Readable<SpotifyPlaybackState | null>>();

/** Older desktop apps keep one callback: the player and karaoke must share that subscription. */
export function watchSpotifyPlayback(
    callback: (state: SpotifyPlaybackState | null) => void,
    desktop: DesktopPlayback | undefined,
): Unsubscriber | undefined {
    if (!desktop?.watchSpotifyPlayback) return undefined;
    let playback = playbackByDesktop.get(desktop);
    if (!playback) {
        playback = readable<SpotifyPlaybackState | null>(null, (set) => {
            set(null);
            return desktop.watchSpotifyPlayback?.(set);
        });
        playbackByDesktop.set(desktop, playback);
    }
    return playback.subscribe(callback);
}
