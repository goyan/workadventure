import type { SpotifyListening } from "@workadventure/messages";

export const EMPTY_SPOTIFY_LISTENING: SpotifyListening = {
    trackTitle: "",
    artistName: "",
    trackUrl: "",
    jamAreaId: "",
    jamAreaName: "",
    albumName: "",
    artworkUrl: "",
    source: "",
};

/** The players a track can come from; any other value is dropped. */
export const LISTENING_SOURCES = ["spotify", "apple-music"] as const;
export type ListeningSource = (typeof LISTENING_SOURCES)[number];

export function isListeningSource(value: string): value is ListeningSource {
    return (LISTENING_SOURCES as readonly string[]).includes(value);
}

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

/** The album cover is displayed as an image to other users: only the Spotify image CDN is accepted. */
export function isSpotifyArtworkUrl(value: string): boolean {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return false;
    }
    return url.protocol === "https:" && url.hostname === "i.scdn.co" && url.pathname.startsWith("/image/");
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
        albumName: value.albumName.slice(0, MAX_TEXT_LENGTH),
        artworkUrl: isSpotifyArtworkUrl(value.artworkUrl) ? value.artworkUrl : "",
        source: isListeningSource(value.source) ? value.source : "",
    };
}

export function isPlayingTrack(listening: SpotifyListening | undefined): listening is SpotifyListening {
    return listening !== undefined && listening.trackTitle !== "";
}

export function isInJam(listening: SpotifyListening | undefined): listening is SpotifyListening {
    return listening !== undefined && listening.jamAreaId !== "";
}

/** The service a listening comes from: Spotify unless it says otherwise (older clients send no source). */
export function listeningSourceOf(listening: SpotifyListening): ListeningSource {
    return isListeningSource(listening.source) ? listening.source : "spotify";
}

/**
 * Where anyone can play the same track, on the service of their choice and without an account to link: the track
 * page on Spotify when it is known, otherwise a search of the title and artist.
 */
export function listenTooLinks(listening: SpotifyListening): Record<ListeningSource, string> {
    const query = `${listening.trackTitle} ${listening.artistName}`.trim();
    return {
        spotify: listening.trackUrl || `https://open.spotify.com/search/${encodeURIComponent(query)}`,
        "apple-music": `https://music.apple.com/search?term=${encodeURIComponent(query)}`,
    };
}
