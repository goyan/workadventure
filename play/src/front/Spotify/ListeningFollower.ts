import type { SpotifyListening } from "@workadventure/messages";
import { derived, writable, type Readable, type Unsubscriber } from "svelte/store";
import { currentPositionMs, spotifyTrackUri } from "../../common/SpotifyListening";
import type { DesktopFollowTarget } from "../Interfaces/DesktopAppInterfaces";
import type { ListeningByUserUuid } from "./SpotifyListeningDirectory";
import { POSITION_DRIFT_MS } from "./SpotifyListeningSharer";

/** The user whose Spotify track the local Spotify app plays along with ("Écouter avec"), undefined when none. */
export const followedUserUuidStore = writable<string | undefined>(undefined);

/**
 * True while the desktop app reports the WorkAdventure Spicetify extension connected: only that extension plays a
 * track on the Spotify app of this computer, Spotify Free included. Without it (browser, no Spicetify), nothing is
 * offered and the Spotify Jam stays the only way to listen together.
 */
export const listenAlongAvailableStore = writable(false);

/**
 * Plays the followed user's track on the Spotify app of this computer, then again on every track change or when
 * their reported position moves away from the deduced one (a seek). When they stop sharing a track, the local
 * player is left as it is: the next track they share resumes the follow. Nothing is sent while the extension is
 * not connected; the follow resumes when it reconnects.
 */
export function startListeningFollower(
    followedUserUuid: Readable<string | undefined>,
    listeningByUserUuid: Readable<ListeningByUserUuid>,
    available: Readable<boolean> = listenAlongAvailableStore,
    follow: ((target: DesktopFollowTarget | null) => void) | undefined = window.WAD?.followListening,
    now: () => number = Date.now,
): Unsubscriber {
    if (!follow) {
        return () => undefined;
    }
    let following = false;
    let sent: SpotifyListening | undefined;
    const unsubscribe = derived(
        [followedUserUuid, listeningByUserUuid, available],
        ([uuid, listeningByUuid, extensionConnected]) =>
            uuid === undefined || !extensionConnected ? null : listeningByUuid.get(uuid),
    ).subscribe((listening) => {
        if (listening === null) {
            if (following) {
                following = false;
                sent = undefined;
                follow(null);
            }
            return;
        }
        following = true;
        const uri = listening ? spotifyTrackUri(listening.trackUrl) : undefined;
        if (!listening || !uri || (sent && !movedAway(sent, listening))) {
            return;
        }
        sent = listening;
        follow({ uri, positionMs: currentPositionMs(listening, now()) ?? 0 });
    });
    return () => {
        unsubscribe();
        if (following) {
            follow(null);
        }
    };
}

/** Another track, or a position away from where the previous one would be (the followed user sought). */
function movedAway(previous: SpotifyListening, next: SpotifyListening): boolean {
    if (previous.trackUrl !== next.trackUrl) {
        return true;
    }
    if (previous.positionAt === 0 || next.positionAt === 0) {
        return false;
    }
    const deduced = previous.positionMs + (next.positionAt - previous.positionAt);
    return Math.abs(deduced - next.positionMs) >= POSITION_DRIFT_MS;
}
