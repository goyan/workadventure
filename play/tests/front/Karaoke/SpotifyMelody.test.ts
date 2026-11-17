import { describe, expect, it } from "vitest";
import { KaraokeReferenceSchema, KaraokeReferenceSource } from "@workadventure/map-editor";
import { buildKaraokeMelody } from "../../../src/front/Karaoke/SpotifyMelody";
import type { DesktopSpotifyAnalysis } from "../../../src/front/Interfaces/DesktopAppInterfaces";

const track = { recordingKey: "song", title: "Song", artist: "Artist" };
const lines = [
    { atMs: 1000, text: "First line" },
    { atMs: 4000, text: "" },
    { atMs: 20_000, text: "Second line" },
];
/** A segment whose strongest note is `note` (0 = C … 11 = B). */
function segment(
    startMs: number,
    durationMs: number,
    note: number,
    loudness = -12,
): DesktopSpotifyAnalysis["segments"][number] {
    return [
        startMs,
        durationMs,
        loudness,
        Array.from({ length: 12 }, (_, index) => (index === note ? "9" : "3")).join(""),
    ];
}
function analysis(segments: DesktopSpotifyAnalysis["segments"]): DesktopSpotifyAnalysis {
    return { uri: "spotify:track:abc", segments };
}

describe("melody from Spotify's analysis", () => {
    it("keeps the strongest note of each segment within the sung lines, merging held notes", () => {
        const melody = buildKaraokeMelody(
            analysis([
                segment(0, 200, 4),
                segment(1000, 200, 7),
                segment(1200, 200, 7),
                segment(1400, 300, 9),
                segment(1700, 250, 11),
                segment(1950, 250, 0),
                segment(2200, 250, 2),
                segment(2450, 250, 4),
                segment(2700, 250, 5),
                segment(6000, 400, 7),
                segment(20_000, 900, 2),
            ]),
            lines,
            track,
        );
        expect(melody?.source).toBe(KaraokeReferenceSource.Auto);
        expect(melody?.notes.map((note) => [note.startMs, note.endMs, note.midi])).toEqual([
            [1000, 1400, 67],
            [1400, 1700, 69],
            [1700, 1950, 71],
            [1950, 2200, 60],
            [2200, 2450, 62],
            [2450, 2700, 64],
            [2700, 2950, 65],
            [20_000, 20_900, 62],
        ]);
        expect(melody?.notes.filter((note) => note.golden).map((note) => note.startMs)).toEqual([20_000]);
        expect(KaraokeReferenceSchema.safeParse(melody).success).toBe(true);
    });
    it("ignores quiet segments, ties between notes and blips too short to sing", () => {
        const tie: DesktopSpotifyAnalysis["segments"][number] = [1000, 300, -12, "990000000000"];
        const melody = buildKaraokeMelody(
            analysis([
                tie,
                segment(1300, 300, 7, -50),
                segment(1600, 60, 9),
                ...Array.from({ length: 8 }, (_, index) => segment(2000 + index * 200, 200, index % 2 ? 2 : 4)),
            ]),
            lines,
            track,
        );
        expect(melody?.notes[0].startMs).toBe(2000);
        expect(melody?.notes).toHaveLength(8);
    });
    it("gives no melody when too few notes come out", () => {
        expect(
            buildKaraokeMelody(analysis([segment(1000, 400, 7), segment(1400, 400, 9)]), lines, track),
        ).toBeUndefined();
        expect(buildKaraokeMelody(analysis([segment(1000, 400, 7)]), [], track)).toBeUndefined();
    });
});
