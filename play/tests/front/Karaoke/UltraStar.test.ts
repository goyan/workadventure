import { describe, expect, it } from "vitest";
import { KaraokeReferenceSource } from "@workadventure/map-editor";
import { parseUltraStar, sameKaraokeSong } from "../../../src/front/Karaoke/UltraStar";

const header = "#TITLE:Une mélodie\n#ARTIST:Artiste\n#BPM:120\n#GAP:1000\n";
describe("UltraStar partitions", () => {
    it("converts quarter beats, GAP and C4-relative pitches, including golden notes", () => {
        const result = parseUltraStar("\uFEFF" + header + ": 0 4 0 Bonjour\n* 4 8 7 salut\nE", "song:123");
        expect(result).toMatchObject({
            recordingKey: "song:123",
            source: KaraokeReferenceSource.UltraStar,
            notes: [
                { startMs: 1000, endMs: 1500, midi: 60, golden: false },
                { startMs: 1500, endMs: 2500, midi: 67, golden: true },
            ],
        });
    });
    it("accepts decimal commas and the first duet voice, ignoring unpitched rap", () => {
        const result = parseUltraStar(
            header.replace("120", "120,0") + "P1\n: 0 4 0 Hi\nF 4 4 0 spoken\n- 8\nP2\n: 0 4 4 other\nE",
            "song",
        );
        expect(result.notes).toHaveLength(1);
    });
    it.each([
        "#RELATIVE:YES\n: 0 4 0 hi",
        ": 0 0 0 hi",
        ": 0 8 0 hi\n: 4 8 7 overlap",
        "B 10 140",
        "F 0 4 0 only-spoken",
        ": 0 4 200 out-of-range",
    ])("rejects unsupported or invalid charts: %s", (body) => {
        expect(() => parseUltraStar(header + body, "song")).toThrow();
    });
    it("rejects oversized files and preserves the song edition in metadata matching", () => {
        expect(() => parseUltraStar("x".repeat(300001), "song")).toThrow();
        expect(sameKaraokeSong("Une mélodie", "UNE MELODIE")).toBe(true);
        expect(sameKaraokeSong("Song (Live)", "Song")).toBe(false);
    });
});
