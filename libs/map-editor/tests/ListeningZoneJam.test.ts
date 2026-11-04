import { describe, expect, it } from "vitest";
import {
    canUpdateListeningZoneJams,
    isHomeJam,
    isSpotifyJamUrl,
    listeningZoneJamKey,
    type ListeningZoneJam,
    MAX_LISTENING_ZONE_JAM_TITLE_LENGTH,
    MAX_LISTENING_ZONE_JAMS,
    parseListeningZoneJams,
    parseListeningZoneJamsUpdate,
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

describe("parseListeningZoneJams", () => {
    const home: ListeningZoneJam = { home: true, hostUuid: "bob", hostName: "Bob" };

    it("reads the rooms stored as JSON, and an older single Jam as one room", () => {
        expect(parseListeningZoneJams(JSON.stringify([jamOf("alice"), home]))).toEqual([jamOf("alice"), home]);
        expect(parseListeningZoneJams(JSON.stringify(jamOf("alice")))).toEqual([jamOf("alice")]);
    });

    it("reads nothing, invalid rooms and a second room of the same host as no room", () => {
        expect(parseListeningZoneJams(undefined)).toEqual([]);
        expect(parseListeningZoneJams("null")).toEqual([]);
        expect(parseListeningZoneJams("{not json")).toEqual([]);
        expect(parseListeningZoneJams([{ ...jamOf("alice"), url: "https://example.com" }, home])).toEqual([home]);
        expect(parseListeningZoneJams([jamOf("alice"), { ...home, hostUuid: "alice" }])).toEqual([jamOf("alice")]);
    });

    it("tells a home Jam, which has a host and no invite link", () => {
        expect(isHomeJam(home)).toBe(true);
        expect(isHomeJam(jamOf("alice"))).toBe(false);
        expect(parseListeningZoneJams([{ home: false, hostUuid: "alice", hostName: "Alice" }])).toEqual([]);
    });

    it("tells Jams apart by their link, or by their host for a home Jam", () => {
        expect(listeningZoneJamKey(jamOf("alice"))).toBe("https://spotify.link/abc123");
        expect(listeningZoneJamKey(home)).toBe("home:bob");
    });
});

describe("parseListeningZoneJamsUpdate", () => {
    it("accepts a list of valid rooms, or null to close them all", () => {
        expect(parseListeningZoneJamsUpdate(JSON.stringify([jamOf("alice")]))).toEqual([jamOf("alice")]);
        expect(parseListeningZoneJamsUpdate("null")).toEqual([]);
    });

    it("refuses rather than trims an invalid room, two rooms of one host, or too many rooms", () => {
        expect(
            parseListeningZoneJamsUpdate(JSON.stringify([{ url: "https://example.com", hostUuid: "a", hostName: "" }])),
        ).toBeNull();
        expect(parseListeningZoneJamsUpdate(JSON.stringify([jamOf("alice"), jamOf("alice")]))).toBeNull();
        const tooMany = Array.from({ length: MAX_LISTENING_ZONE_JAMS + 1 }, (_, index) => jamOf(`user-${index}`));
        expect(parseListeningZoneJamsUpdate(JSON.stringify(tooMany))).toBeNull();
        expect(parseListeningZoneJamsUpdate("{not json")).toBeNull();
    });
});

describe("canUpdateListeningZoneJams", () => {
    it("lets each user open, replace or close their own room", () => {
        expect(canUpdateListeningZoneJams([], [jamOf("alice")], "alice")).toBe(true);
        expect(canUpdateListeningZoneJams([jamOf("bob")], [jamOf("bob"), jamOf("alice")], "alice")).toBe(true);
        expect(canUpdateListeningZoneJams([jamOf("bob"), jamOf("alice")], [jamOf("bob")], "alice")).toBe(true);
    });

    it("refuses to touch someone else's room, or to open two", () => {
        expect(canUpdateListeningZoneJams([jamOf("bob")], [], "alice")).toBe(false);
        expect(canUpdateListeningZoneJams([], [jamOf("bob")], "alice")).toBe(false);
        expect(canUpdateListeningZoneJams([jamOf("bob")], [{ ...jamOf("bob"), hostName: "Mallory" }], "alice")).toBe(
            false,
        );
    });
});

describe("room title", () => {
    it("keeps a short title, and refuses an empty or too long one", () => {
        expect(parseListeningZoneJamsUpdate(JSON.stringify([{ ...jamOf("alice"), title: "Vendredi rock" }]))).toEqual([
            { ...jamOf("alice"), title: "Vendredi rock" },
        ]);
        expect(parseListeningZoneJamsUpdate(JSON.stringify([{ ...jamOf("alice"), title: "" }]))).toBeNull();
        expect(
            parseListeningZoneJamsUpdate(
                JSON.stringify([{ ...jamOf("alice"), title: "x".repeat(MAX_LISTENING_ZONE_JAM_TITLE_LENGTH + 1) }]),
            ),
        ).toBeNull();
    });
});
