// copy of Electron.SourcesOptions to avoid Electron dependency in front
export interface SourcesOptions {
    types: string[];
    thumbnailSize?: { height: number; width: number };
}

export interface DesktopCapturerSource {
    id: string;
    name: string;
    thumbnailURL: string;
}

/** The track the Spotify app of this computer plays, as read by the desktop app (validated in LocalSpotifyPlayer). */
export interface DesktopSpotifyTrack {
    title: string;
    artist: string;
    /** https://open.spotify.com/track/…, or empty when the player gives no public link (Apple Music). */
    url: string;
    album?: string;
    /** https://i.scdn.co/image/… (Spotify only). */
    artworkUrl?: string;
    /** Spotify when absent. */
    source?: "spotify" | "apple-music";
    /** Position in the track (ms) at `positionAt` (ms since the epoch); absent when the player does not tell. */
    positionMs?: number;
    positionAt?: number;
    /** The playlist or album it plays from (spotify:playlist:… or spotify:album:…) and its name; absent otherwise. */
    contextUri?: string;
    contextName?: string;
}

/** A track added to the queue of a Jukebox's host, as its desktop app reports it. */
export interface JukeboxTrack {
    /** spotify:track:… */
    uri: string;
    /** Identifies this entry of the queue (the same track can be queued twice). */
    uid: string;
    title: string;
    artist: string;
    /** https://i.scdn.co/image/…, or empty. */
    artworkUrl: string;
    /** Who added it from WorkAdventure, name and uuid; empty for the host. */
    addedBy: string;
    addedByUuid: string;
}

/**
 * A track still to come from the host's playing playlist or album (or Spotify's autoplay). With its queue uid (desktop
 * extension 1.3.2+), the host moves or removes it, for this playback only.
 */
export type UpcomingTrack = Pick<JukeboxTrack, "uri" | "title" | "artist" | "artworkUrl"> & { uid?: string };

/** What a Jukebox's host plays next: the tracks added to the queue, then the rest of the playlist. */
export interface JukeboxQueue {
    tracks: JukeboxTrack[];
    upcoming: UpcomingTrack[];
    /** The playing playlist or album, empty when it is neither. */
    contextName: string;
}

/** A track to play on the Spotify app of this computer, at a position: listening along with another user. */
export interface DesktopFollowTarget {
    /** spotify:track:… */
    uri: string;
    positionMs: number;
}

/**
 * What the local user shares about their listening, whatever its source (Spotify or Music app of this computer, or
 * the Web API of a linked account). Every field is empty when nothing is shared.
 */
export interface DesktopListening {
    title: string;
    artist: string;
    album: string;
    /** https://open.spotify.com/track/…, or empty when the player gives no public link (Apple Music). */
    url: string;
    /** https://i.scdn.co/image/… (Spotify only). */
    artworkUrl: string;
    /** Empty when nothing plays. */
    source: "spotify" | "apple-music" | "";
    /** The listening zone whose Spotify Jam the user joined, empty otherwise. */
    jamAreaName: string;
}

/** Statuses a desktop app may request (see DESKTOP_STATUS_REQUESTS in Api/Desktop/index.ts). */
export type DesktopStatusRequest = "online" | "busy" | "do-not-disturb" | "back-in-a-moment";

export type WorkAdventureDesktopApi = {
    desktop: boolean;
    isDevelopment: () => Promise<boolean>;
    getVersion: () => Promise<string>;
    notify: (txt: string) => void;
    onMuteToggle: (callback: () => void) => void;
    onCameraToggle: (callback: () => void) => void;
    getDesktopCapturerSources: (options: SourcesOptions) => Promise<DesktopCapturerSource[]>;
    /** Optional: the desktop app sets the availability status (e.g. from its menu bar). */
    onStatusRequest?: (callback: (request: DesktopStatusRequest) => void) => void;
    /** Optional: WorkAdventure reports the effective status, as its enum name and its localized label. */
    reportStatus?: (status: string, label: string) => void;
    /**
     * Optional: reads the Spotify app of this computer until the returned function is called, calling back on every
     * change (null: nothing plays, or Spotify is closed). Never launches Spotify.
     */
    watchSpotifyTrack?: (callback: (track: DesktopSpotifyTrack | null) => void) => () => void;
    /** Optional: WorkAdventure reports what the local user shares about their listening, on every change. */
    reportListening?: (listening: DesktopListening) => void;
    /**
     * Optional: plays `target` on the Spotify app of this computer (null: stop following), through the WorkAdventure
     * Spicetify extension. Called again whenever the followed user changes track or drifts away.
     */
    followListening?: (target: DesktopFollowTarget | null) => void;
    /** Optional: tells, now and on every change, whether the WorkAdventure Spicetify extension is connected. */
    onListenAlongAvailable?: (callback: (available: boolean) => void) => void;
    /** Optional: the home Jam the user takes part in as a guest (null: none); Spotify then offers to add tracks to it. */
    setHomeJam?: (jam: { hostName: string } | null) => void;
    /** Optional: the tracks (spotify:track:…) the user adds to the home Jam from Spotify's context menu. */
    onQueueRequest?: (callback: (uris: string[]) => void) => void;
    /** Optional: as a home Jam's host, adds a guest's tracks to the queue of this computer's Spotify. */
    enqueueOnSpotify?: (request: { uris: string[]; from: string; fromUuid?: string }) => void;
    /** Optional: as a Jukebox's host, the queue of this computer's Spotify, until the returned function is called. */
    watchSpotifyQueue?: (callback: (queue: JukeboxQueue | JukeboxTrack[]) => void) => () => void;
    /** Optional: as a Jukebox's host, removes a track from the queue of this computer's Spotify. */
    dequeueOnSpotify?: (track: Pick<JukeboxTrack, "uri" | "uid">) => void;
    /** Optional: as a Jukebox's host, moves a queued track just before or just after another one. */
    moveInSpotifyQueue?: (
        move: Pick<JukeboxTrack, "uri" | "uid"> &
            ({ before: Pick<JukeboxTrack, "uri" | "uid"> } | { after: Pick<JukeboxTrack, "uri" | "uid"> }),
    ) => void;
    /** Optional: saves a track to the Liked Songs of this computer's Spotify. */
    likeOnSpotify?: (track: { uri: string }) => void;
};
