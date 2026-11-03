/**
 * Redirect URI of the Spotify authorization popup. It must be declared in the Spotify app.
 */
export const SPOTIFY_CALLBACK_PATH = "/spotify/callback";

/**
 * Type of the message the callback page posts to the window that opened it, with the query string Spotify
 * redirected to (`code`, `state` or `error`).
 */
export const SPOTIFY_AUTHORIZATION_MESSAGE_TYPE = "workadventure-spotify-authorization";
