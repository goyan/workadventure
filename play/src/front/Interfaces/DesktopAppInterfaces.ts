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
    /** https://open.spotify.com/track/… */
    url: string;
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
};
