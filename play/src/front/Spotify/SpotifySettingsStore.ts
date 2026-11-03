import { derived, type Readable, type Writable, writable } from "svelte/store";
import { SPOTIFY_CLIENT_ID } from "../Enum/EnvironmentVariable";

const SHARING_KEY = "spotifySharingEnabled";
const PERSONAL_CLIENT_ID_KEY = "spotifyPersonalClientId";

function persistedStore<T>(key: string, defaultValue: T, parse: (raw: string) => T, serialize: (value: T) => string) {
    const raw = localStorage.getItem(key);
    const store: Writable<T> = writable(raw === null ? defaultValue : parse(raw));
    return {
        subscribe: store.subscribe,
        set(value: T) {
            localStorage.setItem(key, serialize(value));
            store.set(value);
        },
    };
}

/** "Share what I listen to": on by default once linked, the user can pause it without unlinking. */
export const spotifySharingEnabledStore = persistedStore(
    SHARING_KEY,
    true,
    (raw) => raw !== "false",
    (value) => String(value),
);

/**
 * Client ID of a Spotify app the user created themselves. A Spotify app in development mode only accepts five
 * users: past them, people link through their own app.
 */
export const spotifyPersonalClientIdStore = persistedStore(
    PERSONAL_CLIENT_ID_KEY,
    "",
    (raw) => raw,
    (value) => value.trim(),
);

/** The client ID to link with: the user's own app first, then the one of this server, if any. */
export const spotifyClientIdStore: Readable<string | undefined> = derived(
    spotifyPersonalClientIdStore,
    (personalClientId) => personalClientId.trim() || SPOTIFY_CLIENT_ID || undefined,
);
