import { describe, expect, it } from "vitest";
import { parseKaraokePlayback, parseKaraokeQueue } from "../../../src/front/Karaoke/SpotifyKaraokeApi";

const item = {
    name: "Test song",
    artists: [{ name: "Test artist" }],
    external_urls: {},
    duration_ms: 200_000,
    album: { name: "Test edition", images: [] },
};
describe("Spotify karaoke metadata", () => {
    it("keeps the paused track and duration of the specific recording", () => {
        expect(
            parseKaraokePlayback({
                is_playing: false,
                progress_ms: 12_000,
                currently_playing_type: "track",
                item,
            }),
        ).toEqual({
            track: { title: "Test song", artist: "Test artist", album: "Test edition", durationMs: 200_000 },
            playing: false,
            positionMs: 12_000,
        });
    });
    it("does not turn ads or episodes into songs", () => {
        expect(
            parseKaraokePlayback({
                is_playing: true,
                progress_ms: 12_000,
                currently_playing_type: "episode",
                item,
            })?.track,
        ).toBeNull();
    });
    it("takes only the first queued recording and clears an empty queue", () => {
        expect(parseKaraokeQueue({ queue: [item, { ...item, name: "Other" }] })?.title).toBe("Test song");
        expect(parseKaraokeQueue({ queue: [] })).toBeUndefined();
        expect(parseKaraokeQueue({ queue: [{ type: "episode" }] })).toBeUndefined();
    });
    it("uses the same Spotify recording identity in the queue and the playing track", () => {
        const recording = { ...item, external_urls: { spotify: "https://open.spotify.com/track/test" } };
        const queued = parseKaraokeQueue({ queue: [recording] });
        const current = parseKaraokePlayback({
            is_playing: true,
            progress_ms: 0,
            currently_playing_type: "track",
            item: recording,
        });
        expect(queued?.uri).toBe("spotify:track:test");
        expect(current?.track?.uri).toBe(queued?.uri);
    });
});
