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
};
