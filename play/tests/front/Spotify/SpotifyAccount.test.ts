import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { SpotifyAccount } from "../../../src/front/Spotify/SpotifyAccount";
import { computeCodeChallenge, generateRandomString } from "../../../src/front/Spotify/SpotifyPkce";

function memoryStorage(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => {
            items.set(key, value);
        },
        removeItem: (key: string) => {
            items.delete(key);
        },
        items,
    };
}

const storedTokens = (expiresAt: number) =>
    JSON.stringify({ clientId: "client", accessToken: "old-access", refreshToken: "refresh", expiresAt });

describe("SpotifyAccount", () => {
    it("is not linked without stored tokens, nor with unreadable ones", async () => {
        const account = new SpotifyAccount(memoryStorage({ spotifyAccount: "{broken" }), vi.fn());

        expect(get(account.linked)).toBe(false);
        expect(await account.getAccessToken()).toBeUndefined();
    });

    it("gives the stored access token while it is valid", async () => {
        const fetchFn = vi.fn<typeof fetch>();
        const account = new SpotifyAccount(
            memoryStorage({ spotifyAccount: storedTokens(Date.now() + 3_600_000) }),
            fetchFn,
        );

        expect(get(account.linked)).toBe(true);
        expect(await account.getAccessToken()).toBe("old-access");
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("refreshes an expired token once, keeping the refresh token Spotify did not rotate", async () => {
        const storage = memoryStorage({ spotifyAccount: storedTokens(Date.now() - 1) });
        const fetchFn = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response(JSON.stringify({ access_token: "new-access", expires_in: 3600 }), { status: 200 }),
            );
        const account = new SpotifyAccount(storage, fetchFn);

        const [first, second] = await Promise.all([account.getAccessToken(), account.getAccessToken()]);

        expect(first).toBe("new-access");
        expect(second).toBe("new-access");
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn.mock.calls[0][1]?.body).toContain("grant_type=refresh_token");
        expect(JSON.parse(storage.items.get("spotifyAccount") ?? "{}")).toMatchObject({
            accessToken: "new-access",
            refreshToken: "refresh",
        });
    });

    it("unlinks when Spotify revoked the refresh token", async () => {
        const storage = memoryStorage({ spotifyAccount: storedTokens(Date.now() - 1) });
        const account = new SpotifyAccount(
            storage,
            vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 400 })),
        );

        expect(await account.getAccessToken()).toBeUndefined();
        expect(get(account.linked)).toBe(false);
        expect(storage.items.has("spotifyAccount")).toBe(false);
    });
});

describe("PKCE", () => {
    it("generates verifiers with the allowed characters only", () => {
        expect(generateRandomString(64)).toMatch(/^[A-Za-z0-9\-._~]{64}$/);
    });

    it("computes the S256 challenge of RFC 7636", async () => {
        // Example from RFC 7636, appendix B.
        expect(await computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        );
    });
});
