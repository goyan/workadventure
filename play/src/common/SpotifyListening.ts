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
    positionMs: 0,
    positionAt: 0,
    contextUri: "",
    contextName: "",
};

/** The players a track can come from; any other value is dropped. */
export const LISTENING_SOURCES = ["spotify", "apple-music"] as const;
export type ListeningSource = (typeof LISTENING_SOURCES)[number];

export function isListeningSource(value: string): value is ListeningSource {
    return (LISTENING_SOURCES as readonly string[]).includes(value);
}

const MAX_TEXT_LENGTH = 200;
/** Longer than any track: a position past it is a client bug, not a track. */
const MAX_POSITION_MS = 24 * 60 * 60 * 1000;

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

/** `spotify:track:<id>`, what a Spotify player plays, from a track page; undefined for any other link. */
export function spotifyTrackUri(trackUrl: string): string | undefined {
    if (!isSpotifyTrackUrl(trackUrl)) {
        return undefined;
    }
    const id = new URL(trackUrl).pathname.split("/")[2];
    return id && /^[A-Za-z0-9]+$/.test(id) ? `spotify:track:${id}` : undefined;
}

/** The kinds of context others can open: a playlist or an album (not an artist, a radio or the liked songs). */
export type SpotifyContextType = "playlist" | "album";

/** The playlist or album a track plays from, from `spotify:playlist:<id>` / `spotify:album:<id>`; undefined otherwise. */
export function parseSpotifyContextUri(uri: string): { type: SpotifyContextType; id: string } | undefined {
    const match = /^spotify:(playlist|album):([A-Za-z0-9]+)$/.exec(uri);
    return match ? { type: match[1] as SpotifyContextType, id: match[2] } : undefined;
}

/** The page of the playlist or album, to open it; undefined for any other context. */
export function spotifyContextUrl(uri: string): string | undefined {
    const context = parseSpotifyContextUri(uri);
    return context ? `https://open.spotify.com/${context.type}/${context.id}` : undefined;
}

/** Where the shared track is at `now`, deduced from the last reported position; undefined when unknown. */
export function currentPositionMs(listening: SpotifyListening, now: number): number | undefined {
    if (listening.positionAt === 0) {
        return undefined;
    }
    return listening.positionMs + Math.max(0, now - listening.positionAt);
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
        positionMs: Math.min(Math.max(Math.round(value.positionMs), 0), MAX_POSITION_MS),
        positionAt: Number.isFinite(value.positionAt) && value.positionAt > 0 ? value.positionAt : 0,
        ...sanitizeContext(value.contextUri, value.contextName),
    };
}

/** A name without a context to open is dropped too: the card shows them together. */
function sanitizeContext(
    contextUri: string,
    contextName: string,
): Pick<SpotifyListening, "contextUri" | "contextName"> {
    if (!parseSpotifyContextUri(contextUri)) {
        return { contextUri: "", contextName: "" };
    }
    return { contextUri, contextName: contextName.slice(0, MAX_TEXT_LENGTH) };
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
