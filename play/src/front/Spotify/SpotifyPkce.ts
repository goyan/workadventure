const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

/**
 * We only read what is currently playing: no playback control, no library access.
 */
export const SPOTIFY_SCOPES = "user-read-currently-playing";

const VERIFIER_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * Random string made of the characters allowed in a PKCE code verifier (RFC 7636 §4.1).
 */
export function generateRandomString(length: number): string {
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values, (value) => VERIFIER_CHARACTERS[value % VERIFIER_CHARACTERS.length]).join("");
}

export async function computeCodeChallenge(codeVerifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function buildAuthorizeUrl(params: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
}): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
        response_type: "code",
        client_id: params.clientId,
        scope: SPOTIFY_SCOPES,
        redirect_uri: params.redirectUri,
        code_challenge_method: "S256",
        code_challenge: params.codeChallenge,
        state: params.state,
    }).toString();
    return url.toString();
}
