import { describe, expect, it } from "vitest";
import {
    addKaraokeLeaderboardEntry,
    KARAOKE_LEADERBOARD_SIZE,
    KaraokeSongLeaderboardSchema,
} from "../src/ListeningZone/KaraokeLeaderboard";
import type { KaraokeSongLeaderboard } from "../src/ListeningZone/KaraokeLeaderboard";

const empty: KaraokeSongLeaderboard = { recordingKey: "song", title: "Song", artist: "Artist", entries: [] };
const entry = (singerUuid: string, score: number, accuracy = 50, at = 1) => ({
    singerUuid,
    name: singerUuid.toUpperCase(),
    score,
    accuracy,
    at,
});

describe("karaoke song ranking", () => {
    it("ranks by score, then accuracy, then whoever reached it first", () => {
        const board = [
            entry("ana", 4000, 60, 3),
            entry("bob", 9000),
            entry("cy", 4000, 80),
            entry("dan", 4000, 60, 2),
        ].reduce(addKaraokeLeaderboardEntry, empty);
        expect(board.entries.map((ranked) => ranked.singerUuid)).toEqual(["bob", "cy", "dan", "ana"]);
    });
    it("keeps only each singer's best turn", () => {
        const better = [entry("ana", 4000), entry("ana", 7000)].reduce(addKaraokeLeaderboardEntry, empty);
        expect(better.entries).toEqual([entry("ana", 7000)]);
        expect(addKaraokeLeaderboardEntry(better, entry("ana", 5000, 50, 9))).toBe(better);
    });
    it("keeps the eleven best singers", () => {
        const board = Array.from({ length: 15 }, (_, index) => entry(`s${index}`, index * 100)).reduce(
            addKaraokeLeaderboardEntry,
            empty,
        );
        expect(board.entries).toHaveLength(KARAOKE_LEADERBOARD_SIZE);
        expect(board.entries[0].score).toBe(1400);
        expect(board.entries[board.entries.length - 1].score).toBe(400);
        expect(KaraokeSongLeaderboardSchema.safeParse(board).success).toBe(true);
    });
});
