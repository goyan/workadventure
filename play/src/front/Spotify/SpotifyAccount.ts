import { type Readable, writable } from "svelte/store";
import { z } from "zod";
import { ABSOLUTE_PUSHER_URL } from "../Enum/ComputedConst";
import { SPOTIFY_AUTHORIZATION_MESSAGE_TYPE, SPOTIFY_CALLBACK_PATH } from "../../common/SpotifyCallback";
import { buildAuthorizeUrl, computeCodeChallenge, generateRandomString } from "./SpotifyPkce";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const STORAGE_KEY = "spotifyAccount";
/** Refresh a bit before the expiry, so that a token never expires in the middle of a request. */
const EXPIRY_MARGIN_MS = 60_000;
const POPUP_FEATURES = "popup,width=480,height=720";
/** The callback page posts its message right before closing: give it time to arrive before calling it a cancel. */
const CLOSED_POPUP_GRACE_MS = 1_000;

const StoredTokens = z.object({
    // Tokens can only be refreshed with the client ID that issued them.
    clientId: z.string(),
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
});
type StoredTokens = z.infer<typeof StoredTokens>;

const TokenResponse = z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number(),
});

const AuthorizationMessage = z.object({
    type: z.literal(SPOTIFY_AUTHORIZATION_MESSAGE_TYPE),
    search: z.string(),
});

export type SpotifyLinkErrorReason = "popupBlocked" | "cancelled" | "denied" | "failed";

export class SpotifyLinkError extends Error {
    constructor(
        public readonly reason: SpotifyLinkErrorReason,
        message = `Spotify link failed: ${reason}`,
    ) {
        super(message);
    }
}

/** Spotify refused the code or the refresh token: the link is gone and must be made again. */
class SpotifyTokenRejectedError extends Error {}

export function getSpotifyRedirectUri(): string {
    return new URL(SPOTIFY_CALLBACK_PATH, ABSOLUTE_PUSHER_URL).toString();
}

/**
 * The user's link to their Spotify account, made with the authorization code flow with PKCE: there is no client
 * secret, and the tokens never leave this browser.
 */
export class SpotifyAccount {
    private tokens: StoredTokens | undefined;
    private refreshing: Promise<string | undefined> | undefined;
    private readonly _linked = writable(false);
    public readonly linked: Readable<boolean> = this._linked;
    private readonly _accessDenied = writable(false);
    /** Linked, but Spotify refuses to answer for this account: it is not registered in the Spotify app. */
    public readonly accessDenied: Readable<boolean> = this._accessDenied;

    constructor(
        private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
        private readonly fetchFn: typeof fetch,
    ) {
        this.tokens = this.readTokens();
        this._linked.set(this.tokens !== undefined);
    }

    /**
     * Must be called from a user gesture: the popup is opened before anything is awaited, or it would be blocked.
     */
    public async link(clientId: string): Promise<void> {
        const popup = window.open("", "spotify-authorization", POPUP_FEATURES);
        if (!popup) {
            throw new SpotifyLinkError("popupBlocked");
        }
        try {
            const codeVerifier = generateRandomString(64);
            const state = generateRandomString(32);
            const redirectUri = getSpotifyRedirectUri();
            const codePromise = waitForAuthorizationCode(popup, state, new URL(redirectUri).origin);
            popup.location.href = buildAuthorizeUrl({
                clientId,
                redirectUri,
                codeChallenge: await computeCodeChallenge(codeVerifier),
                state,
            });
            const code = await codePromise;
            this.saveTokens(
                await this.requestTokens(clientId, {
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: redirectUri,
                    code_verifier: codeVerifier,
                }),
            );
            this._accessDenied.set(false);
        } catch (error) {
            popup.close();
            if (error instanceof SpotifyLinkError) {
                throw error;
            }
            throw new SpotifyLinkError("failed", error instanceof Error ? error.message : String(error));
        }
    }

    public unlink(): void {
        this.saveTokens(undefined);
        this._accessDenied.set(false);
    }

    public reportAccessDenied(): void {
        this._accessDenied.set(true);
    }

    /**
     * A valid access token, refreshed when needed. Undefined when not linked, or when Spotify revoked the link.
     */
    public getAccessToken(): Promise<string | undefined> {
        if (!this.tokens) {
            return Promise.resolve(undefined);
        }
        if (Date.now() < this.tokens.expiresAt - EXPIRY_MARGIN_MS) {
            return Promise.resolve(this.tokens.accessToken);
        }
        this.refreshing ??= this.refresh().finally(() => {
            this.refreshing = undefined;
        });
        return this.refreshing;
    }

    /**
     * Spotify rejected the access token before its expiry: the next call to getAccessToken() refreshes it.
     */
    public expireAccessToken(): void {
        if (this.tokens) {
            this.tokens = { ...this.tokens, expiresAt: 0 };
        }
    }

    private async refresh(): Promise<string | undefined> {
        const tokens = this.tokens;
        if (!tokens) {
            return undefined;
        }
        try {
            const refreshed = await this.requestTokens(
                tokens.clientId,
                { grant_type: "refresh_token", refresh_token: tokens.refreshToken },
                tokens.refreshToken,
            );
            this.saveTokens(refreshed);
            return refreshed.accessToken;
        } catch (error) {
            if (error instanceof SpotifyTokenRejectedError) {
                this.unlink();
                return undefined;
            }
            throw error;
        }
    }

    private async requestTokens(
        clientId: string,
        params: Record<string, string>,
        previousRefreshToken?: string,
    ): Promise<StoredTokens> {
        const response = await this.fetchFn(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: clientId, ...params }).toString(),
        });
        if (response.status === 400 || response.status === 401) {
            throw new SpotifyTokenRejectedError(`Spotify rejected the token request (${response.status})`);
        }
        if (!response.ok) {
            throw new Error(`Spotify token request failed (${response.status})`);
        }
        const data = TokenResponse.parse(await response.json());
        // Spotify may or may not rotate the refresh token: keep the previous one when it does not.
        const refreshToken = data.refresh_token ?? previousRefreshToken;
        if (!refreshToken) {
            throw new Error("Spotify did not return a refresh token");
        }
        return {
            clientId,
            accessToken: data.access_token,
            refreshToken,
            expiresAt: Date.now() + data.expires_in * 1000,
        };
    }

    private readTokens(): StoredTokens | undefined {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (!raw) {
            return undefined;
        }
        try {
            const result = StoredTokens.safeParse(JSON.parse(raw));
            return result.success ? result.data : undefined;
        } catch {
            return undefined;
        }
    }

    private saveTokens(tokens: StoredTokens | undefined): void {
        this.tokens = tokens;
        if (tokens) {
            this.storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
        } else {
            this.storage.removeItem(STORAGE_KEY);
        }
        this._linked.set(tokens !== undefined);
    }
}

function waitForAuthorizationCode(popup: Window, state: string, callbackOrigin: string): Promise<string> {
    return new Promise((resolve, reject) => {
        let closedTimeout: ReturnType<typeof setTimeout> | undefined;

        const settle = (outcome: () => void) => {
            window.removeEventListener("message", onAuthorizationMessage);
            clearInterval(closedPoll);
            clearTimeout(closedTimeout);
            outcome();
        };

        const onAuthorizationMessage = (event: MessageEvent) => {
            if (event.origin !== callbackOrigin || event.source !== popup) {
                return;
            }
            const message = AuthorizationMessage.safeParse(event.data);
            if (!message.success) {
                return;
            }
            const params = new URLSearchParams(message.data.search);
            const code = params.get("code");
            if (params.get("state") !== state) {
                settle(() => reject(new SpotifyLinkError("failed", "Spotify answered with an unexpected state")));
            } else if (params.get("error") === "access_denied") {
                settle(() => reject(new SpotifyLinkError("denied")));
            } else if (!code) {
                settle(() => reject(new SpotifyLinkError("failed", params.get("error") ?? "No code received")));
            } else {
                settle(() => resolve(code));
            }
        };

        const closedPoll = setInterval(() => {
            if (popup.closed && closedTimeout === undefined) {
                closedTimeout = setTimeout(
                    () => settle(() => reject(new SpotifyLinkError("cancelled"))),
                    CLOSED_POPUP_GRACE_MS,
                );
            }
        }, 500);

        window.addEventListener("message", onAuthorizationMessage);
    });
}

export const spotifyAccount = new SpotifyAccount(localStorage, (input, init) => fetch(input, init));
