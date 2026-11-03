import type { SpotifyListening } from "@workadventure/messages";

export const EMPTY_SPOTIFY_LISTENING: SpotifyListening = {
    trackTitle: "",
    artistName: "",
    trackUrl: "",
    jamAreaId: "",
    jamAreaName: "",
};

const MAX_TEXT_LENGTH = 200;

/**
 * The track link is rendered as a clickable link in other users' lists: only a Spotify track page is accepted.
 */
export function isSpotifyTrackUrl(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:" && url.hostname === "open.spotify.com" && url.pathname.startsWith("/track/");
}

/**
 * Brings a client-provided value back to what we accept to forward to other users.
 */
export function sanitizeSpotifyListening(value: SpotifyListening | undefined): SpotifyListening {
    if (!value) {
        return EMPTY_SPOTIFY_LISTENING;
    }
    return {
        trackTitle: value.trackTitle.slice(0, MAX_TEXT_LENGTH),
        artistName: value.artistName.slice(0, MAX_TEXT_LENGTH),
        trackUrl: isSpotifyTrackUrl(value.trackUrl) ? value.trackUrl : "",
        jamAreaId: value.jamAreaId.slice(0, MAX_TEXT_LENGTH),
        jamAreaName: value.jamAreaName.slice(0, MAX_TEXT_LENGTH),
    };
}

export function isPlayingTrack(listening: SpotifyListening | undefined): listening is SpotifyListening {
    return listening !== undefined && listening.trackTitle !== "";
}

export function isInJam(listening: SpotifyListening | undefined): listening is SpotifyListening {
    return listening !== undefined && listening.jamAreaId !== "";
}
