import { describe, expect, it } from "vitest";
import {
    canUpdateListeningZoneJam,
    isHomeJam,
    isSpotifyJamUrl,
    listeningZoneJamKey,
    type ListeningZoneJam,
    parseListeningZoneJam,
} from "../src";

const jamOf = (hostUuid: string): ListeningZoneJam => ({
    url: "https://spotify.link/abc123",
    hostUuid,
    hostName: hostUuid,
});

describe("isSpotifyJamUrl", () => {
    it("accepts the short and the full invite links", () => {
        expect(isSpotifyJamUrl("https://spotify.link/abc123")).toBe(true);
        expect(isSpotifyJamUrl("https://open.spotify.com/socialsession/abc123?si=xyz")).toBe(true);
    });

    it("refuses other Spotify pages, other sites and plain http", () => {
        expect(isSpotifyJamUrl("https://open.spotify.com/track/abc123")).toBe(false);
        expect(isSpotifyJamUrl("https://spotify.link/")).toBe(false);
        expect(isSpotifyJamUrl("https://spotify.link.example.com/abc123")).toBe(false);
        expect(isSpotifyJamUrl("http://spotify.link/abc123")).toBe(false);
        expect(isSpotifyJamUrl("javascript:alert(1)")).toBe(false);
        expect(isSpotifyJamUrl("not a url")).toBe(false);
    });
});

describe("parseListeningZoneJam", () => {
    it("reads a Jam stored as JSON", () => {
        expect(parseListeningZoneJam(JSON.stringify(jamOf("alice")))).toEqual(jamOf("alice"));
    });

    it("reads anything else as no Jam", () => {
        expect(parseListeningZoneJam(undefined)).toBeNull();
        expect(parseListeningZoneJam("null")).toBeNull();
        expect(parseListeningZoneJam("{not json")).toBeNull();
        expect(parseListeningZoneJam({ ...jamOf("alice"), url: "https://example.com" })).toBeNull();
    });

    it("reads a home Jam, which has a host and no invite link", () => {
        const home = { home: true, hostUuid: "alice", hostName: "Alice" };
        const parsed = parseListeningZoneJam(JSON.stringify(home));
        expect(parsed).toEqual(home);
        expect(isHomeJam(parsed)).toBe(true);
        expect(isHomeJam(jamOf("alice"))).toBe(false);
        expect(parseListeningZoneJam({ home: false, hostUuid: "alice", hostName: "Alice" })).toBeNull();
    });

    it("tells Jams apart by their link, or by their host for a home Jam", () => {
        expect(listeningZoneJamKey(jamOf("alice"))).toBe("https://spotify.link/abc123");
        expect(listeningZoneJamKey({ home: true, hostUuid: "alice", hostName: "Alice" })).toBe("home:alice");
    });
});

describe("canUpdateListeningZoneJam", () => {
    it("lets anyone share a Jam when none is shared", () => {
        expect(canUpdateListeningZoneJam(null, jamOf("alice"), "alice")).toBe(true);
    });

    it("forbids sharing a Jam in someone else's name", () => {
        expect(canUpdateListeningZoneJam(null, jamOf("bob"), "alice")).toBe(false);
    });

    it("lets only the host replace or remove the shared Jam", () => {
        expect(canUpdateListeningZoneJam(jamOf("alice"), null, "alice")).toBe(true);
        expect(canUpdateListeningZoneJam(jamOf("alice"), jamOf("alice"), "alice")).toBe(true);
        expect(canUpdateListeningZoneJam(jamOf("alice"), null, "bob")).toBe(false);
        expect(canUpdateListeningZoneJam(jamOf("alice"), jamOf("bob"), "bob")).toBe(false);
    });
});
